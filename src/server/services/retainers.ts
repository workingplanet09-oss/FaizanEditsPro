import type { Prisma, RetainerStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, assertOrgAction, type Actor } from "../auth/actor";
import { retainerScope } from "../auth/access";
import { emit } from "../events/bus";
import { audit } from "./audit";
import { addMonths, nextNumber, startOfMonth } from "./common";
import { createProject } from "./projects";
import { getSetting } from "./settings";
import { formatMoney } from "@/lib/money";

export interface RetainerInput {
  clientId: string;
  planId?: string | null;
  name: string;
  monthlyPrice: number;
  currency?: string;
  videosIncluded?: number;
  shortsIncluded?: number;
  hoursIncluded?: number;
  turnaroundDays?: number;
  revisionsIncluded?: number;
  startDate?: Date;
  notes?: string | null;
}

export async function createRetainer(actor: Actor, input: RetainerInput) {
  assertCan(actor, "retainers:manage");
  const client = await db.client.findFirst({ where: { id: input.clientId, workspaceId: actor.workspaceId } });
  if (!client) throw notFound("Client");
  const business = await getSetting(actor.workspaceId, "business");
  const start = input.startDate ?? new Date();
  const r = await db.retainer.create({
    data: {
      workspaceId: actor.workspaceId,
      organizationId: client.organizationId,
      clientId: client.id,
      planId: input.planId ?? undefined,
      name: input.name,
      monthlyPrice: input.monthlyPrice,
      currency: (input.currency ?? business.defaultCurrency).toUpperCase(),
      videosIncluded: input.videosIncluded ?? 0,
      shortsIncluded: input.shortsIncluded ?? 0,
      hoursIncluded: input.hoursIncluded ?? 0,
      turnaroundDays: input.turnaroundDays ?? 5,
      revisionsIncluded: input.revisionsIncluded ?? 2,
      startDate: start,
      renewalDate: addMonths(start, 1),
      notes: input.notes ?? undefined,
      isDemo: client.isDemo,
    },
  });
  await db.client.update({ where: { id: client.id }, data: { status: "RETAINER" } });
  await audit(actor, { workspaceId: actor.workspaceId, action: "retainer.created", entityType: "retainer", entityId: r.id, message: `${actor.name} started retainer “${r.name}” for ${client.companyName} (${formatMoney(r.monthlyPrice, r.currency)}/mo)` });
  return r;
}

export async function updateRetainer(actor: Actor, id: string, patch: Partial<Omit<RetainerInput, "clientId">> & { status?: RetainerStatus; renewalDate?: Date }) {
  assertCan(actor, "retainers:manage");
  const r = await db.retainer.findFirst({ where: { AND: [{ id }, retainerScope(actor)] } });
  if (!r) throw notFound("Retainer");
  const updated = await db.retainer.update({ where: { id }, data: { ...patch, currency: patch.currency?.toUpperCase() } as Prisma.RetainerUncheckedUpdateInput });
  if (patch.status && patch.status !== r.status) {
    await audit(actor, { workspaceId: actor.workspaceId, action: "retainer.status_changed", entityType: "retainer", entityId: id, message: `${actor.name} set retainer “${r.name}” to ${patch.status}` });
    const active = await db.retainer.count({ where: { clientId: r.clientId, status: "ACTIVE" } });
    await db.client.update({ where: { id: r.clientId }, data: { status: active ? "RETAINER" : "ACTIVE" } });
  }
  return updated;
}

export async function listRetainers(actor: Actor, query: { status?: string; clientId?: string } = {}) {
  const rows = await db.retainer.findMany({
    where: { AND: [retainerScope(actor), query.status ? { status: query.status as RetainerStatus } : {}, query.clientId ? { clientId: query.clientId } : {}] },
    orderBy: [{ status: "asc" }, { renewalDate: "asc" }],
    include: { client: { select: { id: true, companyName: true, name: true } } },
  });
  return Promise.all(rows.map(async (r) => ({ ...r, usage: await retainerAllowance(r.id) })));
}

/** "You have used 7 of 12 included edits this month." */
export async function retainerAllowance(retainerId: string) {
  const r = await db.retainer.findUniqueOrThrow({ where: { id: retainerId } });
  const periodStart = currentPeriodStart(r.renewalDate);
  const usage = await db.retainerUsage.findMany({ where: { retainerId, periodStart } });
  const sum = (kind: string) => usage.filter((u) => u.kind === kind).reduce((s, u) => s + u.quantity, 0);
  const upcoming = await db.project.findMany({ where: { retainerId, status: { notIn: ["DELIVERED", "ARCHIVED", "CANCELLED"] } }, select: { id: true, name: true, code: true, status: true, deadline: true }, orderBy: { deadline: "asc" }, take: 10 });
  const used = { videos: sum("VIDEO"), shorts: sum("SHORT"), hours: sum("HOURS") };
  return {
    periodStart,
    renewalDate: r.renewalDate,
    included: { videos: r.videosIncluded, shorts: r.shortsIncluded, hours: r.hoursIncluded },
    used,
    remaining: { videos: Math.max(0, r.videosIncluded - used.videos), shorts: Math.max(0, r.shortsIncluded - used.shorts), hours: Math.max(0, r.hoursIncluded - used.hours) },
    upcoming,
  };
}

const currentPeriodStart = (renewal: Date) => addMonths(renewal, -1);

export async function recordRetainerUsage(input: { retainerId: string; projectId?: string; kind: "VIDEO" | "SHORT" | "HOURS"; quantity?: number; note?: string }) {
  const r = await db.retainer.findUniqueOrThrow({ where: { id: input.retainerId } });
  return db.retainerUsage.create({ data: { retainerId: r.id, projectId: input.projectId, periodStart: currentPeriodStart(r.renewalDate), kind: input.kind, quantity: input.quantity ?? 1, note: input.note } });
}

/**
 * Starts a project against a retainer's allowance. Within allowance it skips quote/contract/payment
 * (already covered by the monthly fee); beyond allowance it becomes a normal quoted project.
 */
export async function startRetainerProject(actor: Actor, retainerId: string, input: { name: string; description?: string; kind?: "VIDEO" | "SHORT"; deadline?: Date | null }) {
  const r = await db.retainer.findFirst({ where: { AND: [{ id: retainerId }, retainerScope(actor)] } });
  if (!r) throw notFound("Retainer");
  if (actor.isStaff) assertCan(actor, "projects:write");
  else assertOrgAction(actor, r.organizationId, "manage_projects");
  if (r.status !== "ACTIVE") throw new AppError("CONFLICT", `This retainer is ${r.status.toLowerCase()}.`);
  const allowance = await retainerAllowance(retainerId);
  const kind = input.kind ?? "VIDEO";
  const left = kind === "SHORT" ? allowance.remaining.shorts : allowance.remaining.videos;
  if (left <= 0) throw new AppError("CONFLICT", "You've used this month's included edits. Message us and we'll quote the extra work, or wait for your renewal.");
  const project = await createProject(actor.isStaff ? actor : { system: true, label: actor.name }, {
    clientId: r.clientId,
    name: input.name,
    description: input.description,
    status: "ONBOARDING",
    clientVisible: true,
    retainerId,
    revisionLimit: r.revisionsIncluded,
    currency: r.currency,
    scope: { turnaroundBusinessDays: r.turnaroundDays, revisionRounds: r.revisionsIncluded, deliverables: [{ label: kind === "SHORT" ? "Short-form video" : "Video edit", quantity: 1 }] },
    deadline: input.deadline ?? undefined,
    workspaceId: r.workspaceId,
  });
  await db.project.update({ where: { id: project.id }, data: { startDate: new Date() } });
  await db.projectStatusChange.create({ data: { projectId: project.id, fromStatus: "INQUIRY", toStatus: "ONBOARDING", actorId: actor.userId, comment: `Started from retainer “${r.name}”` } });
  await emit("project.activated", { workspaceId: r.workspaceId, actorId: actor.userId, projectId: project.id, clientId: r.clientId });
  return project;
}

/** Sweep: renew retainers on their renewal date and invoice the next month. */
export async function sweepRetainers() {
  const due = await db.retainer.findMany({ where: { status: "ACTIVE", renewalDate: { lte: new Date() } } });
  for (const r of due) {
    const inv = await getSetting(r.workspaceId, "invoice");
    const number = `${inv.prefix}-${await nextNumber(r.workspaceId, "invoice", 1000)}`;
    const dueDate = new Date(Date.now() + inv.dueDays * 86400000);
    const invoice = await db.invoice.create({
      data: {
        workspaceId: r.workspaceId, organizationId: r.organizationId, clientId: r.clientId, retainerId: r.id, number, kind: "RETAINER", currency: r.currency, subtotal: r.monthlyPrice, total: r.monthlyPrice,
        status: "SENT", issuedAt: new Date(), sentAt: new Date(), dueDate, isDemo: r.isDemo,
        items: { create: [{ description: `${r.name} — monthly retainer`, quantity: 1, unitPrice: r.monthlyPrice, amount: r.monthlyPrice }] },
      },
    });
    await db.retainer.update({ where: { id: r.id }, data: { renewalDate: addMonths(r.renewalDate, 1) } });
    await emit("retainer.renewed", { workspaceId: r.workspaceId, clientId: r.clientId, retainerId: r.id, invoiceId: invoice.id });
    await audit({ system: true, label: "System" }, { workspaceId: r.workspaceId, action: "retainer.renewed", entityType: "retainer", entityId: r.id, message: `Retainer “${r.name}” renewed and invoiced` });
  }
  return due.length;
}

export { startOfMonth, badRequest };
