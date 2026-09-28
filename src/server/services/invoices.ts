import type { InvoiceKind, InvoiceStatus, Prisma, Quote } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, assertOrgAction, type Actor } from "../auth/actor";
import { invoiceScope, paymentScope } from "../auth/access";
import { randomToken } from "../auth/crypto";
import { emit } from "../events/bus";
import { getPaymentProvider } from "../payments";
import type { WebhookEvent } from "../payments/types";
import { audit, logActivity, whoName } from "./audit";
import { addDays, nextNumber, pageArgs, paged, type PageInput } from "./common";
import { applyTransition, isActor, type Who } from "./projects";
import { getSetting } from "./settings";
import { absoluteUrl } from "../email";
import { computeTotals, formatMoney } from "@/lib/money";

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

const invoiceInclude = {
  items: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { createdAt: "desc" } },
  client: { select: { id: true, name: true, email: true, companyName: true } },
  project: { select: { id: true, name: true, code: true } },
  quote: { select: { id: true, number: true } },
} satisfies Prisma.InvoiceInclude;

const wsOf = (who: Who, fallback: string) => (isActor(who) ? who.workspaceId : fallback);

export async function createInvoice(actor: Actor, input: { clientId: string; projectId?: string | null; quoteId?: string | null; kind?: InvoiceKind; currency?: string; items: InvoiceItemInput[]; discount?: number; taxRateBps?: number; dueDate?: Date | null; notes?: string | null; send?: boolean }) {
  assertCan(actor, "invoices:write");
  const client = await db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } });
  if (!client) throw notFound("Client");
  if (input.projectId) {
    const p = await db.project.findFirst({ where: { id: input.projectId, clientId: client.id } });
    if (!p) throw notFound("Project");
  }
  if (!input.items.length) throw badRequest("Add at least one line item.", { items: "Add at least one item." });
  const [inv, business] = await Promise.all([getSetting(actor.workspaceId, "invoice"), getSetting(actor.workspaceId, "business")]);
  const currency = (input.currency ?? business.defaultCurrency).toUpperCase();
  const t = computeTotals(input.items, { discount: input.discount, taxRateBps: input.taxRateBps ?? inv.taxRateBps });
  const number = `${inv.prefix}-${await nextNumber(actor.workspaceId, "invoice", 1000)}`;
  const invoice = await db.invoice.create({
    data: {
      workspaceId: actor.workspaceId,
      organizationId: client.organizationId,
      clientId: client.id,
      projectId: input.projectId ?? undefined,
      quoteId: input.quoteId ?? undefined,
      number,
      kind: input.kind ?? "OTHER",
      currency,
      subtotal: t.subtotal,
      discount: t.discount,
      tax: t.tax,
      total: t.total,
      dueDate: input.dueDate ?? addDays(new Date(), inv.dueDays),
      notes: input.notes ?? inv.notes,
      createdById: actor.userId,
      isDemo: client.isDemo,
      items: { create: input.items.map((i, n) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, amount: Math.round(i.quantity * i.unitPrice), sortOrder: n })) },
    },
    include: invoiceInclude,
  });
  await audit(actor, { workspaceId: actor.workspaceId, action: "invoice.created", entityType: "invoice", entityId: invoice.id, message: `${actor.name} generated Invoice #${number} (${formatMoney(t.total, currency)})` });
  if (input.send) return sendInvoice(actor, invoice.id);
  return invoice;
}

/** Internal: derive an invoice from a quote (deposit / balance / full / change order). */
export async function createInvoiceFromQuote(who: Who, quote: Quote, kind: "DEPOSIT" | "BALANCE" | "FULL" | "CHANGE_ORDER") {
  const inv = await getSetting(quote.workspaceId, "invoice");
  const amount = kind === "DEPOSIT" ? quote.deposit : kind === "BALANCE" ? quote.balance : quote.total;
  const label =
    kind === "DEPOSIT" ? `Deposit (${quote.depositPercent}%) — ${quote.title || `Quote ${quote.number}`}` :
    kind === "BALANCE" ? `Remaining balance — ${quote.title || `Quote ${quote.number}`}` :
    kind === "CHANGE_ORDER" ? `${quote.title || "Change order"}` :
    `${quote.title || `Quote ${quote.number}`}`;
  const number = `${inv.prefix}-${await nextNumber(quote.workspaceId, "invoice", 1000)}`;
  const invoice = await db.invoice.create({
    data: {
      workspaceId: quote.workspaceId,
      organizationId: quote.organizationId,
      clientId: quote.clientId,
      projectId: quote.projectId ?? undefined,
      quoteId: quote.id,
      number,
      kind,
      currency: quote.currency,
      subtotal: amount,
      total: amount,
      dueDate: addDays(new Date(), inv.dueDays),
      notes: quote.tax > 0 ? `${inv.notes ?? ""} Amounts include applicable tax.`.trim() : inv.notes,
      createdById: isActor(who) ? who.userId : undefined,
      isDemo: quote.isDemo,
      items: { create: [{ description: label, quantity: 1, unitPrice: amount, amount, sortOrder: 0 }] },
    },
  });
  await audit(who, { workspaceId: quote.workspaceId, action: "invoice.created", entityType: "invoice", entityId: invoice.id, message: `${whoName(who)} generated Invoice #${number} (${formatMoney(amount, quote.currency)})` });
  return invoice;
}

export async function sendInvoice(who: Who, id: string) {
  if (isActor(who)) assertCan(who, "invoices:write");
  const inv = await db.invoice.findFirst({ where: isActor(who) ? { AND: [{ id }, invoiceScope(who)] } : { id } });
  if (!inv) throw notFound("Invoice");
  if (["PAID", "CANCELLED"].includes(inv.status)) throw new AppError("CONFLICT", `This invoice is ${inv.status.toLowerCase()}.`);
  const updated = await db.invoice.update({ where: { id }, data: { status: inv.status === "DRAFT" ? "SENT" : inv.status, issuedAt: inv.issuedAt ?? new Date(), sentAt: new Date() } });
  if (inv.projectId) await db.project.update({ where: { id: inv.projectId }, data: { clientVisible: true } });
  const ws = inv.workspaceId;
  await audit(who, { workspaceId: ws, action: "invoice.sent", entityType: "invoice", entityId: id, message: `${whoName(who)} sent Invoice #${inv.number}` });
  await logActivity(who, { workspaceId: ws, type: "invoice.sent", message: `Invoice ${inv.number} issued (${formatMoney(inv.total, inv.currency)})`, projectId: inv.projectId, clientId: inv.clientId, visibility: "CLIENT" });
  const lead = await db.lead.findFirst({ where: { convertedClientId: inv.clientId }, select: { id: true } });
  if (lead) await db.leadActivity.create({ data: { leadId: lead.id, type: "invoice_created", title: `Invoice ${inv.number} created`, actorId: isActor(who) ? who.userId : null } });
  await emit("invoice.sent", { workspaceId: ws, actorId: isActor(who) ? who.userId : null, projectId: inv.projectId ?? undefined, clientId: inv.clientId, invoiceId: id });
  return updated;
}

export async function cancelInvoice(actor: Actor, id: string, reason?: string) {
  assertCan(actor, "invoices:write");
  const inv = await db.invoice.findFirst({ where: { AND: [{ id }, invoiceScope(actor)] } });
  if (!inv) throw notFound("Invoice");
  if (inv.amountPaid > 0) throw new AppError("CONFLICT", "This invoice has payments recorded and can't be cancelled.");
  await db.invoice.update({ where: { id }, data: { status: "CANCELLED", notes: reason ? `${inv.notes ?? ""}\nCancelled: ${reason}`.trim() : inv.notes } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "invoice.cancelled", entityType: "invoice", entityId: id, message: `${actor.name} cancelled Invoice #${inv.number}` });
  return { ok: true };
}

export interface InvoiceListQuery extends PageInput {
  q?: string;
  status?: string;
  clientId?: string;
  projectId?: string;
}

export async function listInvoices(actor: Actor, query: InvoiceListQuery = {}) {
  if (actor.isStaff) assertCan(actor, "invoices:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.InvoiceWhereInput = {
    AND: [invoiceScope(actor), query.status ? { status: query.status as InvoiceStatus } : {}, query.clientId ? { clientId: query.clientId } : {}, query.projectId ? { projectId: query.projectId } : {}, query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { client: { companyName: { contains: query.q, mode: "insensitive" } } }] } : {}],
  };
  const [rows, total] = await Promise.all([
    db.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { client: { select: { companyName: true, name: true } }, project: { select: { id: true, name: true, code: true } } } }),
    db.invoice.count({ where }),
  ]);
  return paged(rows, total, page, pageSize);
}

export async function getInvoice(actor: Actor, id: string, opts: { markViewed?: boolean } = {}) {
  const inv = await db.invoice.findFirst({ where: { AND: [{ id }, invoiceScope(actor)] }, include: invoiceInclude });
  if (!inv) throw notFound("Invoice");
  if (opts.markViewed && !actor.isStaff && inv.status === "SENT") {
    await db.invoice.update({ where: { id }, data: { status: "VIEWED", viewedAt: new Date() } });
    return { ...inv, status: "VIEWED" as InvoiceStatus };
  }
  return inv;
}

// ───────────────────────────── payments ─────────────────────────────

export async function startCheckout(actor: Actor, invoiceId: string) {
  const inv = await db.invoice.findFirst({ where: { AND: [{ id: invoiceId }, invoiceScope(actor)] }, include: { client: true } });
  if (!inv) throw notFound("Invoice");
  assertOrgAction(actor, inv.organizationId, "billing");
  if (["PAID", "CANCELLED", "DRAFT"].includes(inv.status)) throw new AppError("CONFLICT", inv.status === "PAID" ? "This invoice is already paid." : "This invoice can't be paid right now.");
  const due = inv.total - inv.amountPaid;
  const provider = getPaymentProvider();
  return provider.createCheckout({
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    amount: due,
    currency: inv.currency,
    customerEmail: inv.client.email,
    successUrl: absoluteUrl(`/dashboard/invoices/${inv.id}?paid=1`),
    cancelUrl: absoluteUrl(`/dashboard/invoices/${inv.id}?cancelled=1`),
    description: `Invoice ${inv.number}`,
  });
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  currency: string;
  provider: string;
  transactionId: string;
  method?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * The only place money is recorded. Idempotent on (provider, transactionId) so provider webhook retries
 * can never double-count. Updates the invoice, activates the project, and triggers notifications.
 */
export async function recordPayment(who: Who, input: RecordPaymentInput) {
  const inv = await db.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!inv) throw notFound("Invoice");
  if (input.currency.toUpperCase() !== inv.currency) throw badRequest(`Payment currency ${input.currency} doesn't match the invoice (${inv.currency}).`);
  if (input.amount <= 0) throw badRequest("Payment amount must be positive.");
  const remaining = inv.total - inv.amountPaid;
  if (input.amount > remaining) throw badRequest(`That's more than the outstanding balance (${formatMoney(remaining, inv.currency)}).`);
  if (["CANCELLED", "DRAFT"].includes(inv.status)) throw new AppError("CONFLICT", "This invoice isn't payable.");

  const existing = await db.payment.findUnique({ where: { provider_transactionId: { provider: input.provider, transactionId: input.transactionId } } });
  if (existing) return { payment: existing, invoice: inv, duplicate: true };

  const now = new Date();
  const { payment, invoice } = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { workspaceId: inv.workspaceId, invoiceId: inv.id, clientId: inv.clientId, organizationId: inv.organizationId, amount: input.amount, currency: inv.currency, provider: input.provider, transactionId: input.transactionId, method: input.method, status: "SUCCEEDED", paidAt: now, metadata: input.metadata, isDemo: inv.isDemo },
    });
    const paid = inv.amountPaid + input.amount;
    const full = paid >= inv.total;
    const invoice = await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: full ? "PAID" : "PARTIALLY_PAID", paidAt: full ? now : null, paymentMethod: input.method ?? input.provider } });
    return { payment, invoice };
  });

  const ws = inv.workspaceId;
  await audit(who, { workspaceId: ws, action: "payment.received", entityType: "payment", entityId: payment.id, message: `${formatMoney(input.amount, inv.currency)} received for Invoice #${inv.number} via ${input.provider}`, metadata: { invoiceId: inv.id, transactionId: input.transactionId } });
  await logActivity(who, { workspaceId: ws, type: "payment.received", message: `Payment of ${formatMoney(input.amount, inv.currency)} received (Invoice ${inv.number})`, projectId: inv.projectId, clientId: inv.clientId, visibility: "CLIENT" });
  const lead = await db.lead.findFirst({ where: { convertedClientId: inv.clientId }, select: { id: true } });
  if (lead) await db.leadActivity.create({ data: { leadId: lead.id, type: "payment_received", title: `Payment received — ${formatMoney(input.amount, inv.currency)}` } });

  await db.client.update({ where: { id: inv.clientId }, data: { status: "ACTIVE" } });

  // Project activation: deposit / full payment while awaiting payment → onboarding begins.
  if (inv.projectId && invoice.status === "PAID" && ["DEPOSIT", "FULL"].includes(inv.kind)) {
    const project = await db.project.findUnique({ where: { id: inv.projectId } });
    if (project?.status === "AWAITING_PAYMENT") {
      await applyTransition(who, inv.projectId, "ONBOARDING", { comment: `Payment received (Invoice ${inv.number})`, quiet: true });
      const lead2 = await db.lead.findFirst({ where: { convertedClientId: inv.clientId }, select: { id: true } });
      if (lead2) await db.leadActivity.create({ data: { leadId: lead2.id, type: "project_started", title: "Project started" } });
    }
  }
  await qualifyReferral(inv.clientId, ws);
  await emit("payment.received", { workspaceId: ws, actorId: isActor(who) ? who.userId : null, projectId: inv.projectId ?? undefined, clientId: inv.clientId, invoiceId: inv.id, data: { amount: input.amount, currency: inv.currency } });
  return { payment, invoice, duplicate: false };
}

async function qualifyReferral(clientId: string, workspaceId: string) {
  const wf = await getSetting(workspaceId, "workflow");
  if (!wf.referralsEnabled) return;
  await db.referral.updateMany({ where: { referredClientId: clientId, status: "PENDING" }, data: { status: "QUALIFIED", reward: wf.referralReward } });
}

/** Demo-mode checkout: no card is charged, but the full payment pipeline (invoice, project activation, emails) runs for real. */
export async function demoPay(actor: Actor, invoiceId: string) {
  if (env.payments.provider !== "demo") throw new AppError("FORBIDDEN", "Demo payments are disabled.");
  const inv = await db.invoice.findFirst({ where: { AND: [{ id: invoiceId }, invoiceScope(actor)] } });
  if (!inv) throw notFound("Invoice");
  assertOrgAction(actor, inv.organizationId, "billing");
  return recordPayment(actor, { invoiceId, amount: inv.total - inv.amountPaid, currency: inv.currency, provider: "demo", transactionId: `demo_${randomToken(9)}`, method: "demo checkout" });
}

/** Staff records an offline payment (bank transfer, cash, etc.). */
export async function recordManualPayment(actor: Actor, invoiceId: string, input: { amount: number; method: string; reference?: string }) {
  assertCan(actor, "payments:write");
  const inv = await db.invoice.findFirst({ where: { AND: [{ id: invoiceId }, invoiceScope(actor)] } });
  if (!inv) throw notFound("Invoice");
  return recordPayment(actor, { invoiceId, amount: input.amount, currency: inv.currency, provider: "manual", transactionId: input.reference?.trim() || `manual_${randomToken(9)}`, method: input.method });
}

export async function handlePaymentWebhook(event: WebhookEvent) {
  if (event.type === "payment.succeeded") {
    const inv = await db.invoice.findUnique({ where: { id: event.invoiceId } });
    if (!inv) return { ignored: true };
    return recordPayment({ system: true, label: "Payment provider" }, { invoiceId: inv.id, amount: Math.min(event.amount, inv.total - inv.amountPaid), currency: event.currency, provider: getPaymentProvider().name, transactionId: event.transactionId, method: event.method });
  }
  const inv = await db.invoice.findUnique({ where: { id: event.invoiceId } });
  if (inv) {
    await db.payment.upsert({
      where: { provider_transactionId: { provider: getPaymentProvider().name, transactionId: event.transactionId } },
      create: { workspaceId: inv.workspaceId, invoiceId: inv.id, clientId: inv.clientId, organizationId: inv.organizationId, amount: event.amount, currency: inv.currency, provider: getPaymentProvider().name, transactionId: event.transactionId, status: "FAILED", isDemo: inv.isDemo },
      update: { status: "FAILED" },
    });
  }
  return { ok: true };
}

export async function listPayments(actor: Actor, query: PageInput & { invoiceId?: string } = {}) {
  if (actor.isStaff) assertCan(actor, "payments:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.PaymentWhereInput = { AND: [paymentScope(actor), query.invoiceId ? { invoiceId: query.invoiceId } : {}] };
  const [rows, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { invoice: { select: { number: true } }, client: { select: { companyName: true } } } }),
    db.payment.count({ where }),
  ]);
  return paged(rows, total, page, pageSize);
}

// ───────────────────────────── lifecycle helpers ─────────────────────────────

/** When the client approves the final cut, bill the remaining balance (if the quote had a deposit split). */
export async function ensureBalanceInvoice(who: Who, projectId: string) {
  const quote = await db.quote.findFirst({ where: { projectId, status: "ACCEPTED", changeRequestId: null }, orderBy: { createdAt: "desc" } });
  if (!quote || quote.balance <= 0) return null;
  const exists = await db.invoice.count({ where: { quoteId: quote.id, kind: "BALANCE", status: { not: "CANCELLED" } } });
  if (exists) return null;
  const inv = await createInvoiceFromQuote(who, quote, "BALANCE");
  await sendInvoice(who, inv.id);
  return inv;
}

/** Sweep: mark past-due invoices overdue (once) and fire reminders. */
export async function sweepInvoices() {
  const now = new Date();
  const overdue = await db.invoice.findMany({ where: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } });
  for (const inv of overdue) {
    await db.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    await emit("invoice.overdue", { workspaceId: inv.workspaceId, projectId: inv.projectId ?? undefined, clientId: inv.clientId, invoiceId: inv.id });
    await audit({ system: true, label: "System" }, { workspaceId: inv.workspaceId, action: "invoice.overdue", entityType: "invoice", entityId: inv.id, message: `Invoice #${inv.number} became overdue` });
  }
  const soon = await db.invoice.findMany({ where: { status: { in: ["SENT", "VIEWED"] }, dueDate: { gte: now, lt: addDays(now, 2) } } });
  const { enqueueJob } = await import("../jobs/queue");
  for (const inv of soon) {
    await enqueueJob("automation.emit", { name: "invoice.due_soon", payload: { workspaceId: inv.workspaceId, projectId: inv.projectId, clientId: inv.clientId, invoiceId: inv.id } }, { dedupeKey: `due-soon:${inv.id}` });
  }
  return { overdue: overdue.length, dueSoon: soon.length };
}
