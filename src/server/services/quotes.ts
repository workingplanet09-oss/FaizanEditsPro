import type { Prisma, QuoteStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, assertOrgAction, type Actor } from "../auth/actor";
import { quoteScope } from "../auth/access";
import { emit } from "../events/bus";
import { getRequestMeta } from "../request-context";
import { audit, logActivity } from "./audit";
import { addDays, nextNumber, pageArgs, paged, type PageInput } from "./common";
import { applyTransition, createProject } from "./projects";
import { getSetting } from "./settings";
import { computeTotals } from "@/lib/money";
import { formatMoney } from "@/lib/money";

export interface QuoteItemInput {
  description: string;
  serviceId?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface QuoteInput {
  clientId: string;
  projectId?: string | null;
  leadId?: string | null;
  title?: string;
  currency?: string;
  items: QuoteItemInput[];
  discount?: number;
  taxRateBps?: number;
  depositPercent?: number;
  validUntil?: Date | null;
  notes?: string | null;
  terms?: string | null;
  projectName?: string;
  serviceId?: string | null;
  projectTypeKey?: string | null;
}

const quoteInclude = {
  items: { orderBy: { sortOrder: "asc" } },
  client: { select: { id: true, name: true, email: true, companyName: true } },
  project: { select: { id: true, name: true, code: true, status: true } },
  createdBy: { select: { name: true } },
  contracts: { select: { id: true, status: true, number: true } },
  invoices: { select: { id: true, number: true, status: true, kind: true, total: true } },
} satisfies Prisma.QuoteInclude;

function totalsFor(input: Pick<QuoteInput, "items" | "discount" | "taxRateBps" | "depositPercent">) {
  if (!input.items.length) throw badRequest("Add at least one line item.", { items: "Add at least one item." });
  return computeTotals(input.items, { discount: input.discount, taxRateBps: input.taxRateBps, depositPercent: input.depositPercent });
}

export async function createQuote(actor: Actor, input: QuoteInput) {
  assertCan(actor, "quotes:write");
  const client = await db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } });
  if (!client) throw notFound("Client");
  const [settings, business] = await Promise.all([getSetting(actor.workspaceId, "quote"), getSetting(actor.workspaceId, "business")]);
  const currency = (input.currency ?? business.defaultCurrency).toUpperCase();
  const t = totalsFor({ ...input, taxRateBps: input.taxRateBps ?? settings.taxRateBps, depositPercent: input.depositPercent ?? settings.defaultDepositPercent });

  let projectId = input.projectId ?? null;
  if (projectId) {
    const p = await db.project.findFirst({ where: { id: projectId, clientId: client.id, workspaceId: actor.workspaceId } });
    if (!p) throw notFound("Project");
  } else {
    const project = await createProject(actor, {
      clientId: client.id,
      name: input.projectName || input.title || input.items[0].description,
      serviceId: input.serviceId ?? input.items.find((i) => i.serviceId)?.serviceId ?? null,
      projectTypeKey: input.projectTypeKey ?? null,
      status: "AWAITING_QUOTE",
      currency,
    });
    projectId = project.id;
  }
  const number = `${settings.prefix}-${await nextNumber(actor.workspaceId, "quote", 1000)}`;
  const quote = await db.quote.create({
    data: {
      workspaceId: actor.workspaceId,
      organizationId: client.organizationId,
      clientId: client.id,
      projectId,
      leadId: input.leadId ?? undefined,
      number,
      title: input.title,
      currency,
      subtotal: t.subtotal,
      discount: t.discount,
      taxRateBps: input.taxRateBps ?? settings.taxRateBps,
      tax: t.tax,
      total: t.total,
      depositPercent: input.depositPercent ?? settings.defaultDepositPercent,
      deposit: t.deposit,
      balance: t.balance,
      validUntil: input.validUntil ?? addDays(new Date(), settings.validDays),
      notes: input.notes ?? undefined,
      terms: input.terms ?? settings.terms,
      createdById: actor.userId,
      isDemo: client.isDemo,
      items: { create: input.items.map((it, i) => ({ description: it.description, serviceId: it.serviceId ?? undefined, quantity: it.quantity, unitPrice: it.unitPrice, amount: Math.round(it.quantity * it.unitPrice), sortOrder: i })) },
    },
    include: quoteInclude,
  });
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId! } });
  if (p.status === "INQUIRY") await applyTransition(actor, projectId!, "AWAITING_QUOTE", { quiet: true });
  await db.project.update({ where: { id: projectId! }, data: { currency } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "quote.created", entityType: "quote", entityId: quote.id, message: `${actor.name} created quote ${number} (${formatMoney(t.total, currency)})` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "quote.created", message: `Quote ${number} created`, projectId, clientId: client.id, leadId: input.leadId ?? null, visibility: "INTERNAL" });
  if (input.leadId) {
    await db.leadActivity.create({ data: { leadId: input.leadId, type: "quote_created", title: `Quote ${number} created`, actorId: actor.userId, metadata: { quoteId: quote.id } } });
  }
  return quote;
}

export async function updateQuote(actor: Actor, id: string, patch: Partial<Omit<QuoteInput, "clientId" | "projectId" | "leadId">>) {
  assertCan(actor, "quotes:write");
  const q = await db.quote.findFirst({ where: { AND: [{ id }, quoteScope(actor)] }, include: { items: true } });
  if (!q) throw notFound("Quote");
  if (["ACCEPTED", "REJECTED", "EXPIRED"].includes(q.status)) throw new AppError("CONFLICT", `This quote is ${q.status.toLowerCase()} and can't be edited. Create a new quote instead.`);
  const items = patch.items ?? q.items.map((i) => ({ description: i.description, serviceId: i.serviceId, quantity: i.quantity, unitPrice: i.unitPrice }));
  const t = totalsFor({ items, discount: patch.discount ?? q.discount, taxRateBps: patch.taxRateBps ?? q.taxRateBps, depositPercent: patch.depositPercent ?? q.depositPercent });
  const updated = await db.$transaction(async (tx) => {
    if (patch.items) {
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      await tx.quoteItem.createMany({ data: items.map((it, i) => ({ quoteId: id, description: it.description, serviceId: it.serviceId ?? undefined, quantity: it.quantity, unitPrice: it.unitPrice, amount: Math.round(it.quantity * it.unitPrice), sortOrder: i })) });
    }
    return tx.quote.update({
      where: { id },
      data: {
        title: patch.title ?? undefined,
        currency: patch.currency?.toUpperCase(),
        subtotal: t.subtotal,
        discount: t.discount,
        taxRateBps: patch.taxRateBps ?? q.taxRateBps,
        tax: t.tax,
        total: t.total,
        depositPercent: patch.depositPercent ?? q.depositPercent,
        deposit: t.deposit,
        balance: t.balance,
        validUntil: patch.validUntil === undefined ? undefined : patch.validUntil,
        notes: patch.notes === undefined ? undefined : patch.notes,
        terms: patch.terms === undefined ? undefined : patch.terms,
        // a revised quote needs to be re-sent
        status: q.status === "DRAFT" ? "DRAFT" : "DRAFT",
      },
      include: quoteInclude,
    });
  });
  await audit(actor, { workspaceId: actor.workspaceId, action: "quote.updated", entityType: "quote", entityId: id, message: `${actor.name} edited quote ${q.number}` });
  return updated;
}

export async function sendQuote(actor: Actor, id: string) {
  assertCan(actor, "quotes:write");
  const q = await db.quote.findFirst({ where: { AND: [{ id }, quoteScope(actor)] } });
  if (!q) throw notFound("Quote");
  if (["ACCEPTED", "REJECTED"].includes(q.status)) throw new AppError("CONFLICT", "This quote is already closed.");
  const settings = await getSetting(actor.workspaceId, "quote");
  const updated = await db.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), validUntil: q.validUntil && q.validUntil > new Date() ? q.validUntil : addDays(new Date(), settings.validDays) } });
  if (q.projectId) await db.project.update({ where: { id: q.projectId }, data: { clientVisible: true } });
  await db.client.update({ where: { id: q.clientId }, data: { lastContactAt: new Date() } });
  if (q.leadId) await db.lead.update({ where: { id: q.leadId }, data: { status: "QUOTED", lastContactAt: new Date() } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "quote.sent", entityType: "quote", entityId: id, message: `${actor.name} sent quote ${q.number}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "quote.sent", message: `Quote ${q.number} sent to the client`, projectId: q.projectId, clientId: q.clientId, visibility: "CLIENT" });
  if (q.leadId) await db.leadActivity.create({ data: { leadId: q.leadId, type: "quote_sent", title: `Quote ${q.number} sent`, actorId: actor.userId } });
  await emit("quote.sent", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: q.projectId ?? undefined, clientId: q.clientId, quoteId: id, leadId: q.leadId ?? undefined });
  return updated;
}

export interface QuoteListQuery extends PageInput {
  q?: string;
  status?: string;
  clientId?: string;
}

export async function listQuotes(actor: Actor, query: QuoteListQuery = {}) {
  if (actor.isStaff) assertCan(actor, "quotes:read");
  const { page, pageSize, skip, take } = pageArgs(query);
  const where: Prisma.QuoteWhereInput = {
    AND: [quoteScope(actor), query.status ? { status: query.status as QuoteStatus } : {}, query.clientId ? { clientId: query.clientId } : {}, query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { client: { companyName: { contains: query.q, mode: "insensitive" } } }, { title: { contains: query.q, mode: "insensitive" } }] } : {}],
  };
  const [rows, total] = await Promise.all([
    db.quote.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { client: { select: { companyName: true, name: true } }, project: { select: { id: true, name: true, code: true } } } }),
    db.quote.count({ where }),
  ]);
  return paged(rows, total, page, pageSize);
}

export async function getQuote(actor: Actor, id: string, opts: { markViewed?: boolean } = {}) {
  const q = await db.quote.findFirst({ where: { AND: [{ id }, quoteScope(actor)] }, include: quoteInclude });
  if (!q) throw notFound("Quote");
  if (opts.markViewed && !actor.isStaff && q.status === "SENT") {
    await db.quote.update({ where: { id }, data: { status: "VIEWED", viewedAt: new Date() } });
    await logActivity(actor, { workspaceId: actor.workspaceId, type: "quote.viewed", message: `${actor.name} viewed quote ${q.number}`, projectId: q.projectId, clientId: q.clientId, visibility: "INTERNAL" });
    if (q.leadId) await db.leadActivity.create({ data: { leadId: q.leadId, type: "quote_viewed", title: `Quote ${q.number} viewed by ${actor.name}` } });
    return { ...q, status: "VIEWED" as const, viewedAt: new Date() };
  }
  return q;
}

/** Client accepts → quote ACCEPTED, project moves to contract stage, a draft contract is prepared for the studio. */
export async function acceptQuote(actor: Actor, id: string) {
  const q = await db.quote.findFirst({ where: { AND: [{ id }, quoteScope(actor)] } });
  if (!q) throw notFound("Quote");
  assertOrgAction(actor, q.organizationId, "approve");
  if (!["SENT", "VIEWED"].includes(q.status)) throw new AppError("CONFLICT", q.status === "ACCEPTED" ? "You've already accepted this quote." : "This quote can't be accepted right now.");
  if (q.validUntil && q.validUntil < new Date()) {
    await db.quote.update({ where: { id }, data: { status: "EXPIRED" } });
    throw new AppError("CONFLICT", "This quote has expired. Message us and we'll refresh it.");
  }
  const meta = getRequestMeta();
  const accepted = await db.quote.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: actor.userId, acceptedIp: meta.ip } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "quote.accepted", entityType: "quote", entityId: id, message: `${actor.name} accepted quote ${q.number}`, metadata: { ip: meta.ip ?? null } });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "quote.accepted", message: `${actor.name} accepted quote ${q.number}`, projectId: q.projectId, clientId: q.clientId, visibility: "CLIENT" });
  if (q.leadId) await db.leadActivity.create({ data: { leadId: q.leadId, type: "quote_accepted", title: `Quote ${q.number} accepted by ${actor.name}` } });

  if (q.changeRequestId) {
    // change orders skip the contract stage: invoice straight away
    const { createInvoiceFromQuote, sendInvoice } = await import("./invoices");
    const inv = await createInvoiceFromQuote({ system: true, label: "Change order" }, accepted, "CHANGE_ORDER");
    await sendInvoice({ system: true, label: "Change order" }, inv.id);
    await db.changeRequest.update({ where: { id: q.changeRequestId }, data: { classification: "ADDITIONAL_COST" } });
  } else if (q.projectId) {
    const p = await db.project.findUniqueOrThrow({ where: { id: q.projectId } });
    if (p.status === "AWAITING_QUOTE" || p.status === "INQUIRY") {
      if (p.status === "INQUIRY") await applyTransition(actor, q.projectId, "AWAITING_QUOTE", { quiet: true });
      await applyTransition(actor, q.projectId, "AWAITING_CONTRACT", { comment: `Quote ${q.number} accepted`, quiet: true });
    }
    const { createContractDraft } = await import("./contracts");
    await createContractDraft({ system: true, label: "System" }, q.projectId, q.id).catch((e) => console.error("[quotes] contract draft failed", e));
  }
  await db.client.update({ where: { id: q.clientId }, data: { status: "ONBOARDING" } });
  await emit("quote.accepted", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: q.projectId ?? undefined, clientId: q.clientId, quoteId: id, leadId: q.leadId ?? undefined });
  return accepted;
}

export async function rejectQuote(actor: Actor, id: string, reason?: string) {
  const q = await db.quote.findFirst({ where: { AND: [{ id }, quoteScope(actor)] } });
  if (!q) throw notFound("Quote");
  assertOrgAction(actor, q.organizationId, "approve");
  if (!["SENT", "VIEWED"].includes(q.status)) throw new AppError("CONFLICT", "This quote can't be declined right now.");
  const r = await db.quote.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "quote.rejected", entityType: "quote", entityId: id, message: `${actor.name} declined quote ${q.number}${reason ? `: ${reason}` : ""}` });
  await logActivity(actor, { workspaceId: actor.workspaceId, type: "quote.rejected", message: `${actor.name} declined quote ${q.number}`, projectId: q.projectId, clientId: q.clientId, visibility: "INTERNAL" });
  await emit("quote.rejected", { workspaceId: actor.workspaceId, actorId: actor.userId, projectId: q.projectId ?? undefined, clientId: q.clientId, quoteId: id });
  return r;
}

export async function createChangeOrderQuote(actor: Actor, projectId: string, input: { changeRequestId: string; title: string; amount: number; description: string }) {
  const p = await db.project.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId } });
  if (!p) throw notFound("Project");
  const q = await createQuote(actor, { clientId: p.clientId, projectId, title: `Change order — ${input.title}`, currency: p.currency, items: [{ description: input.description.slice(0, 300), quantity: 1, unitPrice: input.amount }], depositPercent: 100, taxRateBps: 0 });
  await db.quote.update({ where: { id: q.id }, data: { changeRequestId: input.changeRequestId } });
  return sendQuote(actor, q.id);
}

export async function expireQuotes() {
  const r = await db.quote.updateMany({ where: { status: { in: ["SENT", "VIEWED"] }, validUntil: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return r.count;
}
