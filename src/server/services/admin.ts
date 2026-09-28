import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { assertCan, type Actor } from "../auth/actor";
import { pageArgs, paged, type PageInput } from "./common";

/** Immutable audit trail viewer (audit:read). */
export async function listAuditLog(actor: Actor, query: PageInput & { q?: string; entityType?: string; actorId?: string; action?: string } = {}) {
  assertCan(actor, "audit:read");
  const { page, pageSize, skip, take } = pageArgs(query, 40, 200);
  const where: Prisma.AuditLogWhereInput = {
    workspaceId: actor.workspaceId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.q ? { OR: [{ message: { contains: query.q, mode: "insensitive" } }, { action: { contains: query.q, mode: "insensitive" } }, { actorLabel: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.auditLog.count({ where })]);
  return paged(rows, total, page, pageSize);
}

/** Outbox of every email the platform generated (also the demo-mode "sent mail" viewer). */
export async function listEmails(actor: Actor, query: PageInput & { q?: string; status?: string } = {}) {
  assertCan(actor, "automations:manage");
  const { page, pageSize, skip, take } = pageArgs(query, 30, 100);
  const where: Prisma.EmailLogWhereInput = {
    workspaceId: actor.workspaceId,
    ...(query.status ? { status: query.status as any } : {}),
    ...(query.q ? { OR: [{ toEmail: { contains: query.q, mode: "insensitive" } }, { subject: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([db.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.emailLog.count({ where })]);
  return paged(rows.map((r) => ({ ...r, metadata: undefined })), total, page, pageSize);
}

export async function jobStats(actor: Actor) {
  assertCan(actor, "settings:manage");
  const [groups, failed, recent] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.job.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, lastError: true, attempts: true, createdAt: true } }),
    db.job.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { id: true, type: true, status: true, attempts: true, createdAt: true, completedAt: true } }),
  ]);
  return { counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])), failed, recent };
}

export async function retryFailedJobs(actor: Actor) {
  assertCan(actor, "settings:manage");
  const r = await db.job.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", attempts: 0, runAt: new Date() } });
  return { retried: r.count };
}
