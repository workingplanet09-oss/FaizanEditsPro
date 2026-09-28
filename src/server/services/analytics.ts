import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { assertCan, can, orgIdsOf, type Actor } from "../auth/actor";
import { projectScope } from "../auth/access";
import { addDays } from "./common";
import { getSetting } from "./settings";
import { recentUnread } from "./messages";
import { retainerAllowance } from "./retainers";
import { onboardingChecklist } from "./clients";
import { paymentStateOf } from "./projects";
import { PIPELINE, STATUS_META, OPEN_STATUSES, type ProjectStatusKey } from "@/lib/statuses";
import { relativeDeadline, pluralize } from "@/lib/format";

type Money = Record<string, number>;
const addMoney = (m: Money, cur: string, n: number) => {
  m[cur] = (m[cur] ?? 0) + n;
};

const OPEN = OPEN_STATUSES as unknown as Prisma.ProjectWhereInput["status"];

// ═══════════════════════════ ADMIN COMMAND CENTER ═══════════════════════════

export interface Alert {
  key: string;
  tone: "danger" | "warning" | "info";
  text: string;
  count: number;
  href: string;
}

export async function adminHome(actor: Actor) {
  assertCan(actor, "admin:access");
  const ws = actor.workspaceId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const canLeads = can(actor, "leads:read");
  const canProjects = can(actor, "projects:read_all");
  const canInvoices = can(actor, "invoices:read");
  const canQuotes = can(actor, "quotes:read");
  const scope = projectScope(actor);

  const [newLeadsCount, unassignedNew, activeClients, activeProjects, dueSoon, pendingReviews, revenuePayments, outstandingInvoices, overdueInvoices, retainers, openRevisions, awaitingQuotes, tomorrowDeadlines, lateProjects, statusGroups] = await Promise.all([
    canLeads ? db.lead.count({ where: { workspaceId: ws, status: "NEW", createdAt: { gte: addDays(now, -14) } } }) : 0,
    canLeads ? db.lead.count({ where: { workspaceId: ws, status: "NEW" } }) : 0,
    can(actor, "clients:read") ? db.client.count({ where: { workspaceId: ws, status: { in: ["ACTIVE", "RETAINER", "ONBOARDING"] } } }) : 0,
    canProjects ? db.project.count({ where: { AND: [scope, { status: { in: ["ONBOARDING", "AWAITING_ASSETS", "QUEUED", "EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "REVISION", "FINAL_REVIEW"] } }] } }) : 0,
    canProjects ? db.project.count({ where: { AND: [scope, { status: { in: OPEN as any }, deadline: { gte: now, lte: addDays(now, 3) } }] } }) : 0,
    canProjects ? db.project.count({ where: { AND: [scope, { status: { in: ["CLIENT_REVIEW", "FINAL_REVIEW"] } }] } }) : 0,
    canInvoices ? db.payment.findMany({ where: { workspaceId: ws, status: "SUCCEEDED", paidAt: { gte: monthStart } }, select: { amount: true, currency: true } }) : [],
    canInvoices ? db.invoice.findMany({ where: { workspaceId: ws, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { total: true, amountPaid: true, currency: true } }) : [],
    canInvoices ? db.invoice.count({ where: { workspaceId: ws, status: "OVERDUE" } }) : 0,
    canInvoices ? db.retainer.findMany({ where: { workspaceId: ws, status: "ACTIVE" }, select: { monthlyPrice: true, currency: true } }) : [],
    canProjects ? db.revisionRequest.count({ where: { workspaceId: ws, status: { in: ["OPEN", "IN_PROGRESS"] }, project: scope } }) : 0,
    canQuotes ? db.quote.count({ where: { workspaceId: ws, status: { in: ["SENT", "VIEWED"] } } }) : 0,
    canProjects ? db.project.count({ where: { AND: [scope, { status: { in: OPEN as any }, deadline: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2) } }] } }) : 0,
    canProjects ? db.project.count({ where: { AND: [scope, { status: { in: OPEN as any }, deadline: { lt: now } }] } }) : 0,
    canProjects ? db.project.groupBy({ by: ["status"], where: scope, _count: { _all: true } }) : [],
  ]);

  const monthlyRevenue: Money = {};
  revenuePayments.forEach((p) => addMoney(monthlyRevenue, p.currency, p.amount));
  const pendingPayments: Money = {};
  outstandingInvoices.forEach((i) => addMoney(pendingPayments, i.currency, i.total - i.amountPaid));
  const retainerRevenue: Money = {};
  retainers.forEach((r) => addMoney(retainerRevenue, r.currency, r.monthlyPrice));

  const byStatus = new Map(statusGroups.map((g) => [g.status as string, g._count._all]));
  const pipeline = PIPELINE.map((stage) => ({ key: stage.key, label: stage.label, count: stage.statuses.reduce((s, st) => s + (byStatus.get(st) ?? 0), 0) }));

  const alerts: Alert[] = [];
  const push = (a: Alert) => a.count > 0 && alerts.push(a);
  push({ key: "review", tone: "warning", count: pendingReviews, text: `${pluralize(pendingReviews, "project")} ${pendingReviews === 1 ? "needs" : "need"} client review`, href: "/admin/projects?status=CLIENT_REVIEW,FINAL_REVIEW" });
  push({ key: "overdue-inv", tone: "danger", count: overdueInvoices, text: `${pluralize(overdueInvoices, "invoice")} ${overdueInvoices === 1 ? "is" : "are"} overdue`, href: "/admin/invoices?status=OVERDUE" });
  push({ key: "leads", tone: "info", count: unassignedNew, text: `${pluralize(unassignedNew, "new lead")} ${unassignedNew === 1 ? "requires" : "require"} a response`, href: "/admin/leads?section=leads" });
  push({ key: "tomorrow", tone: "warning", count: tomorrowDeadlines, text: `${pluralize(tomorrowDeadlines, "project deadline")} ${tomorrowDeadlines === 1 ? "is" : "are"} tomorrow`, href: "/admin/projects?deadline=week&sort=deadline" });
  push({ key: "late", tone: "danger", count: lateProjects, text: `${pluralize(lateProjects, "project")} ${lateProjects === 1 ? "is" : "are"} past deadline`, href: "/admin/projects?deadline=overdue" });
  push({ key: "revisions", tone: "info", count: openRevisions, text: `${pluralize(openRevisions, "revision request")} ${openRevisions === 1 ? "is" : "are"} open`, href: "/admin/projects?status=REVISION" });
  push({ key: "quotes", tone: "info", count: awaitingQuotes, text: `${pluralize(awaitingQuotes, "quote")} ${awaitingQuotes === 1 ? "is" : "are"} awaiting acceptance`, href: "/admin/quotes?status=SENT" });

  const [recent, deadlines, unreadMsgs, unpaid] = await Promise.all([
    db.activityLog.findMany({ where: { workspaceId: ws, ...(canProjects ? {} : { projectId: null }) }, orderBy: { createdAt: "desc" }, take: 12, include: { actor: { select: { name: true } }, project: { select: { id: true, name: true, code: true } } } }),
    canProjects ? db.project.findMany({ where: { AND: [scope, { status: { in: OPEN as any }, deadline: { not: null } }] }, orderBy: { deadline: "asc" }, take: 8, select: { id: true, name: true, code: true, deadline: true, status: true, client: { select: { companyName: true } } } }) : [],
    can(actor, "messages:read") ? recentUnread(actor, 5) : [],
    canInvoices ? db.invoice.findMany({ where: { workspaceId: ws, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: { dueDate: "asc" }, take: 6, select: { id: true, number: true, total: true, amountPaid: true, currency: true, dueDate: true, status: true, client: { select: { companyName: true } } } }) : [],
  ]);

  return {
    metrics: { newLeads: newLeadsCount, activeClients, activeProjects, dueSoon, pendingReviews, pendingPayments, monthlyRevenue, retainerRevenue },
    pipeline,
    alerts,
    recent: recent.map((r) => ({ id: r.id, message: r.message, at: r.createdAt, by: r.actor?.name ?? "System", project: r.project })),
    deadlines: deadlines.map((d) => ({ ...d, label: relativeDeadline(d.deadline), status: d.status as ProjectStatusKey })),
    unreadMessages: unreadMsgs,
    unpaid,
    perms: { leads: canLeads, projects: canProjects, invoices: canInvoices },
  };
}

// ═══════════════════════════ ANALYTICS (real data only) ═══════════════════════════

async function monthly(table: "leads" | "clients" | "projects", ws: string, from: Date, to: Date, extra = "") {
  const rows = await db.$queryRawUnsafe<{ m: Date; n: bigint }[]>(
    `SELECT date_trunc('month', "createdAt") AS m, count(*)::bigint AS n FROM ${table} WHERE "workspaceId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 ${extra} GROUP BY 1 ORDER BY 1`,
    ws,
    from,
    to,
  );
  return rows.map((r) => ({ month: r.m.toISOString().slice(0, 7), value: Number(r.n) }));
}

function monthKeys(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d < to) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const fill = (keys: string[], series: { month: string; value: number }[]) => {
  const m = new Map(series.map((s) => [s.month, s.value]));
  return keys.map((k) => ({ month: k, value: m.get(k) ?? 0 }));
};

export async function analyticsReport(actor: Actor, range: { from?: Date; to?: Date } = {}) {
  assertCan(actor, "analytics:read");
  const ws = actor.workspaceId;
  const to = range.to ?? addDays(new Date(), 1);
  const from = range.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  const keys = monthKeys(from, to);
  const business = await getSetting(ws, "business");

  const [leadsM, clientsM, leadSources, projectTypes, payments, projects, deliveredProjects, activeClients, retainerClients, revisions, overdue, allClientsWithProjects, leadStatus, statusGroups, invoiceAgg] = await Promise.all([
    monthly("leads", ws, from, to),
    monthly("clients", ws, from, to),
    db.lead.groupBy({ by: ["sourceId"], where: { workspaceId: ws, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.project.groupBy({ by: ["projectTypeId"], where: { workspaceId: ws, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.payment.findMany({ where: { workspaceId: ws, status: "SUCCEEDED", paidAt: { gte: from, lt: to } }, select: { amount: true, currency: true, paidAt: true, invoice: { select: { project: { select: { service: { select: { title: true } } } } } } } }),
    db.project.count({ where: { workspaceId: ws, createdAt: { gte: from, lt: to } } }),
    db.project.findMany({ where: { workspaceId: ws, status: { in: ["DELIVERED", "ARCHIVED"] }, deliveredAt: { gte: from, lt: to } }, select: { startDate: true, deliveredAt: true } }),
    db.client.count({ where: { workspaceId: ws, status: { in: ["ACTIVE", "RETAINER", "ONBOARDING"] } } }),
    db.client.count({ where: { workspaceId: ws, status: "RETAINER" } }),
    db.revisionRequest.count({ where: { workspaceId: ws, createdAt: { gte: from, lt: to } } }),
    db.project.count({ where: { workspaceId: ws, status: { in: OPEN as any }, deadline: { lt: new Date() } } }),
    db.client.findMany({ where: { workspaceId: ws }, select: { _count: { select: { projects: true } } } }),
    db.lead.groupBy({ by: ["status"], where: { workspaceId: ws, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.project.groupBy({ by: ["status"], where: { workspaceId: ws }, _count: { _all: true } }),
    db.invoice.aggregate({ where: { workspaceId: ws, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { total: true, amountPaid: true } }),
  ]);

  const sources = await db.leadSource.findMany();
  const sn = new Map(sources.map((s) => [s.id, s.label]));
  const types = await db.projectType.findMany({ where: { workspaceId: ws } });
  const tn = new Map(types.map((t) => [t.id, t.name]));

  // revenue: charts use the default currency; other currencies are listed as totals
  const revenueTotals: Money = {};
  const revenueByMonth = new Map<string, number>();
  const revenueByService: Record<string, number> = {};
  const paymentsCount: Money = {};
  for (const p of payments) {
    addMoney(revenueTotals, p.currency, p.amount);
    addMoney(paymentsCount, p.currency, 1);
    if (p.currency === business.defaultCurrency && p.paidAt) {
      const k = p.paidAt.toISOString().slice(0, 7);
      revenueByMonth.set(k, (revenueByMonth.get(k) ?? 0) + p.amount);
      const svc = p.invoice.project?.service?.title ?? "Other";
      revenueByService[svc] = (revenueByService[svc] ?? 0) + p.amount;
    }
  }
  const aov: Money = {};
  for (const [cur, total] of Object.entries(revenueTotals)) aov[cur] = Math.round(total / Math.max(1, paymentsCount[cur] ?? 1));

  const turnaroundDays = deliveredProjects.filter((p) => p.startDate && p.deliveredAt).map((p) => (p.deliveredAt!.getTime() - p.startDate!.getTime()) / 86400000);
  const statusMap = new Map(statusGroups.map((s) => [s.status, s._count._all]));
  const leadTotal = leadStatus.reduce((s, r) => s + r._count._all, 0);
  const leadConverted = leadStatus.find((r) => r.status === "CONVERTED")?._count._all ?? 0;

  return {
    range: { from, to },
    defaultCurrency: business.defaultCurrency,
    leadsByMonth: fill(keys, leadsM),
    clientGrowth: fill(keys, clientsM),
    revenueByMonth: keys.map((k) => ({ month: k, value: revenueByMonth.get(k) ?? 0 })),
    leadSources: leadSources.map((s) => ({ label: s.sourceId ? sn.get(s.sourceId) ?? "Unknown" : "Unknown", value: s._count._all })).sort((a, b) => b.value - a.value),
    projectTypes: projectTypes.map((t) => ({ label: t.projectTypeId ? tn.get(t.projectTypeId) ?? "Other" : "Unclassified", value: t._count._all })).sort((a, b) => b.value - a.value),
    revenueByService: Object.entries(revenueByService).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    revenueTotals,
    averageOrderValue: aov,
    activeClients,
    repeatClients: allClientsWithProjects.filter((c) => c._count.projects > 1).length,
    retainerClients,
    averageTurnaroundDays: turnaroundDays.length ? Math.round((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length) * 10) / 10 : null,
    revisionCount: revisions,
    projectsCreated: projects,
    projectsCompleted: deliveredProjects.length,
    overdueProjects: overdue,
    outstanding: (invoiceAgg._sum.total ?? 0) - (invoiceAgg._sum.amountPaid ?? 0),
    leadConversion: { total: leadTotal, converted: leadConverted, rate: leadTotal ? Math.round((leadConverted / leadTotal) * 1000) / 10 : null },
    statusDistribution: (Object.keys(STATUS_META) as ProjectStatusKey[]).map((s) => ({ key: s, label: STATUS_META[s].label, value: statusMap.get(s) ?? 0 })).filter((s) => s.value > 0),
    hasData: leadTotal + projects + payments.length > 0,
  };
}

export async function profitability(actor: Actor) {
  assertCan(actor, "profitability:read");
  const ws = actor.workspaceId;
  const projects = await db.project.findMany({
    where: { workspaceId: ws, status: { notIn: ["INQUIRY", "AWAITING_QUOTE", "CANCELLED"] } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, name: true, code: true, currency: true, internalCost: true, client: { select: { companyName: true } }, invoices: { select: { amountPaid: true, currency: true } }, timeEntries: { select: { seconds: true, user: { select: { hourlyCost: true } } } } },
  });
  return projects.map((p) => {
    const revenue = p.invoices.filter((i) => i.currency === p.currency).reduce((s, i) => s + i.amountPaid, 0);
    const seconds = p.timeEntries.reduce((s, t) => s + t.seconds, 0);
    const laborCost = Math.round(p.timeEntries.reduce((s, t) => s + (t.seconds / 3600) * (t.user.hourlyCost ?? 0), 0));
    const cost = laborCost + (p.internalCost ?? 0);
    return { id: p.id, code: p.code, name: p.name, client: p.client.companyName, currency: p.currency, revenue, cost, hours: Math.round((seconds / 3600) * 10) / 10, margin: revenue - cost, marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null };
  });
}

export async function teamWorkload(actor: Actor) {
  assertCan(actor, "analytics:read");
  const ws = actor.workspaceId;
  const users = await db.user.findMany({ where: { workspaceId: ws, isStaff: true, status: "ACTIVE", roles: { some: { role: { key: { in: ["editor", "senior_editor", "motion_designer", "reviewer", "project_manager"] } } } } }, select: { id: true, name: true, roles: { select: { role: { select: { name: true } } } } } });
  const rows = await Promise.all(
    users.map(async (u) => {
      const [projects, tasks, hours] = await Promise.all([
        db.project.count({ where: { workspaceId: ws, status: { in: OPEN as any }, members: { some: { userId: u.id } } } }),
        db.task.count({ where: { workspaceId: ws, assigneeId: u.id, status: { not: "COMPLETE" } } }),
        db.timeEntry.aggregate({ where: { workspaceId: ws, userId: u.id, startedAt: { gte: addDays(new Date(), -30) } }, _sum: { seconds: true } }),
      ]);
      return { id: u.id, name: u.name, role: u.roles.map((r) => r.role.name).join(", "), projects, openTasks: tasks, hours30d: Math.round(((hours._sum.seconds ?? 0) / 3600) * 10) / 10 };
    }),
  );
  return rows.sort((a, b) => b.projects + b.openTasks - (a.projects + a.openTasks));
}

// ═══════════════════════════ CALENDAR ═══════════════════════════

export interface CalEvent {
  id: string;
  title: string;
  kind: "deadline" | "call" | "start" | "draft" | "revision" | "meeting" | "retainer" | "custom" | "task";
  at: string;
  end?: string;
  href?: string;
  allDay?: boolean;
}

export async function calendarEvents(actor: Actor, from: Date, to: Date): Promise<CalEvent[]> {
  const scope = projectScope(actor);
  const ws = actor.workspaceId;
  const staffAll = can(actor, "leads:read");
  const [deadlines, starts, meetings, retainers, custom, tasks, revisions] = await Promise.all([
    db.project.findMany({ where: { AND: [scope, { deadline: { gte: from, lte: to }, status: { notIn: ["CANCELLED", "ARCHIVED"] } }] }, select: { id: true, name: true, code: true, deadline: true } }),
    db.project.findMany({ where: { AND: [scope, { startDate: { gte: from, lte: to } }] }, select: { id: true, name: true, code: true, startDate: true } }),
    staffAll ? db.meeting.findMany({ where: { workspaceId: ws, startsAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, select: { id: true, title: true, type: true, startsAt: true, endsAt: true, leadId: true } }) : [],
    can(actor, "retainers:manage") || can(actor, "clients:read") ? db.retainer.findMany({ where: { workspaceId: ws, status: "ACTIVE", renewalDate: { gte: from, lte: to } }, select: { id: true, name: true, renewalDate: true, client: { select: { companyName: true } } } }) : [],
    db.calendarEvent.findMany({ where: { workspaceId: ws, startsAt: { gte: from, lte: to } } }),
    db.task.findMany({ where: { workspaceId: ws, dueDate: { gte: from, lte: to }, status: { not: "COMPLETE" }, parentId: null, ...(can(actor, "projects:read_all") ? {} : { assigneeId: actor.userId }) }, select: { id: true, title: true, dueDate: true, projectId: true }, take: 100 }),
    db.revisionRequest.findMany({ where: { workspaceId: ws, status: { in: ["OPEN", "IN_PROGRESS"] }, project: scope, createdAt: { gte: addDays(from, -30), lte: to } }, select: { id: true, roundNumber: true, createdAt: true, projectId: true, project: { select: { name: true, deadline: true } } } }),
  ]);
  const base = actor.isStaff && can(actor, "admin:access") ? "/admin" : "/editor";
  const ev: CalEvent[] = [];
  deadlines.forEach((p) => ev.push({ id: `d-${p.id}`, title: `Deadline: ${p.name}`, kind: "deadline", at: p.deadline!.toISOString(), allDay: true, href: `${base}/projects/${p.id}` }));
  starts.forEach((p) => ev.push({ id: `s-${p.id}`, title: `Project start: ${p.name}`, kind: "start", at: p.startDate!.toISOString(), allDay: true, href: `${base}/projects/${p.id}` }));
  meetings.forEach((m) => ev.push({ id: `m-${m.id}`, title: m.title, kind: m.type === "CLIENT_REVIEW_CALL" ? "meeting" : "call", at: m.startsAt.toISOString(), end: m.endsAt.toISOString(), href: m.leadId ? `/admin/leads/${m.leadId}` : undefined }));
  retainers.forEach((r) => ev.push({ id: `r-${r.id}`, title: `Retainer renewal: ${r.client.companyName}`, kind: "retainer", at: r.renewalDate.toISOString(), allDay: true, href: "/admin/retainers" }));
  custom.forEach((c) => ev.push({ id: `c-${c.id}`, title: c.title, kind: "custom", at: c.startsAt.toISOString(), end: c.endsAt?.toISOString(), allDay: c.allDay }));
  tasks.forEach((t) => ev.push({ id: `t-${t.id}`, title: `Task: ${t.title}`, kind: "task", at: t.dueDate!.toISOString(), allDay: true, href: `${base}/tasks` }));
  revisions.forEach((r) => ev.push({ id: `rv-${r.id}`, title: `Revision ${r.roundNumber} due: ${r.project.name}`, kind: "revision", at: addDays(r.createdAt, 2).toISOString(), allDay: true, href: `${base}/projects/${r.projectId}` }));
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

// ═══════════════════════════ CLIENT HOME ═══════════════════════════

export interface AttentionItem {
  key: string;
  kind: "quote" | "contract" | "invoice" | "setup" | "files" | "review" | "approve" | "download" | "feedback" | "brief";
  title: string;
  detail: string;
  cta: string;
  href: string;
  tone: "warning" | "accent" | "success";
}

export async function clientHome(actor: Actor) {
  const orgIds = orgIdsOf(actor);
  const scope = projectScope(actor);
  const [projects, quotes, contracts, invoices, fileReqs, activity, retainers, storage, unreadMsgs] = await Promise.all([
    db.project.findMany({
      where: { AND: [scope, { status: { notIn: ["ARCHIVED", "CANCELLED"] } }] },
      orderBy: { updatedAt: "desc" },
      include: { members: { include: { user: { select: { name: true } } } }, manager: { select: { name: true } }, service: { select: { title: true } }, versions: { where: { releasedAt: { not: null } }, orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, label: true, reviewStatus: true } } },
    }),
    db.quote.findMany({ where: { organizationId: { in: orgIds }, status: { in: ["SENT", "VIEWED"] } }, include: { project: { select: { name: true } } } }),
    db.contract.findMany({ where: { organizationId: { in: orgIds }, status: { in: ["SENT", "VIEWED"] } }, include: { project: { select: { name: true } } } }),
    db.invoice.findMany({ where: { organizationId: { in: orgIds }, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, include: { project: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    db.fileRequest.findMany({ where: { status: "OPEN", project: scope }, include: { project: { select: { id: true, name: true } } } }),
    db.activityLog.findMany({ where: { visibility: "CLIENT", OR: [{ project: scope }, { clientId: { in: (await db.client.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })).map((c) => c.id) }, projectId: null }] }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true } }, project: { select: { id: true, name: true } } } }),
    db.retainer.findMany({ where: { organizationId: { in: orgIds }, status: "ACTIVE" } }),
    (await import("./assets")).storageUsage(actor, orgIds[0] ?? ""),
    (await import("./messages")).unreadMessageCount(actor),
  ]);

  const attention: AttentionItem[] = [];
  for (const q of quotes) attention.push({ key: `q-${q.id}`, kind: "quote", title: "Your quote is ready", detail: `${q.number}${q.project ? ` · ${q.project.name}` : ""}`, cta: "Review quote", href: `/dashboard/quotes/${q.id}`, tone: "accent" });
  for (const c of contracts) attention.push({ key: `c-${c.id}`, kind: "contract", title: "Your contract is ready to sign", detail: `${c.number} · ${c.project.name}`, cta: "Review & sign", href: `/dashboard/contracts/${c.id}`, tone: "accent" });
  for (const i of invoices) attention.push({ key: `i-${i.id}`, kind: "invoice", title: i.status === "OVERDUE" ? "An invoice is overdue" : "You have an invoice to pay", detail: `${i.number}${i.project ? ` · ${i.project.name}` : ""}`, cta: "Pay invoice", href: `/dashboard/invoices/${i.id}`, tone: "warning" });
  for (const p of projects) {
    const latest = p.versions[0];
    if (p.status === "ONBOARDING") attention.push({ key: `s-${p.id}`, kind: "setup", title: "Set up your project", detail: `${p.name} — tell us exactly what you want`, cta: "Continue project setup", href: `/dashboard/projects/${p.id}/setup`, tone: "accent" });
    if (p.status === "AWAITING_ASSETS") attention.push({ key: `a-${p.id}`, kind: "files", title: "Upload your files", detail: `${p.name} — we start as soon as your footage arrives`, cta: "Upload files", href: `/dashboard/projects/${p.id}?tab=files`, tone: "warning" });
    if ((p.status === "CLIENT_REVIEW" || p.status === "FINAL_REVIEW") && latest) attention.push({ key: `r-${p.id}`, kind: p.status === "FINAL_REVIEW" ? "approve" : "review", title: p.status === "FINAL_REVIEW" ? "Your final video is ready for approval" : "Your draft is waiting for review", detail: `${p.name} · ${latest.label}`, cta: "Review video", href: `/dashboard/projects/${p.id}/review/${latest.id}`, tone: "warning" });
    if (p.status === "APPROVED") attention.push({ key: `dl-${p.id}`, kind: "download", title: "We're preparing your final files", detail: p.name, cta: "Open project", href: `/dashboard/projects/${p.id}?tab=delivery`, tone: "success" });
    if (p.status === "DELIVERED" && p.deliveredAt && Date.now() - p.deliveredAt.getTime() < 14 * 86400000) attention.push({ key: `dv-${p.id}`, kind: "download", title: "Your final files are ready", detail: p.name, cta: "Download files", href: `/dashboard/projects/${p.id}?tab=delivery`, tone: "success" });
  }
  for (const f of fileReqs) attention.push({ key: `f-${f.id}`, kind: "files", title: "Action required: file request", detail: `${f.title} — ${f.project.name}`, cta: "Upload", href: `/dashboard/projects/${f.project.id}?tab=files&request=${f.id}`, tone: "warning" });

  const [retainerCards, checklist, firstClient] = await Promise.all([
    Promise.all(retainers.map(async (r) => ({ id: r.id, name: r.name, monthlyPrice: r.monthlyPrice, currency: r.currency, ...(await retainerAllowance(r.id)) }))),
    (async () => {
      const c = await db.client.findFirst({ where: { organizationId: { in: orgIds } }, orderBy: { createdAt: "asc" }, select: { id: true, firstTime: true, name: true } });
      return c ? { checklist: await onboardingChecklist(actor, c.id).catch(() => null), client: c } : { checklist: null, client: null };
    })(),
    db.client.findFirst({ where: { organizationId: { in: orgIds } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, companyName: true } }),
  ]);

  return {
    attention,
    projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status as ProjectStatusKey, deadline: p.deadline, service: p.service?.title ?? null, editor: p.members.find((m) => m.role === "EDITOR" || m.role === "MOTION_DESIGNER")?.user.name ?? p.manager?.name ?? null, latestVersion: p.versions[0] ?? null, progress: STATUS_META[p.status as ProjectStatusKey].progress, paymentState: paymentStateOf([]) })),
    activity: activity.map((a) => ({ id: a.id, message: a.message, at: a.createdAt, by: a.actor?.name ?? "Studio", project: a.project })),
    retainers: retainerCards,
    storage,
    unreadMessages: unreadMsgs,
    checklist: checklist.checklist,
    firstTime: checklist.client?.firstTime ?? true,
    clientId: firstClient?.id ?? null,
    hasProjects: projects.length > 0,
  };
}

// ═══════════════════════════ EDITOR HOME ═══════════════════════════

export async function editorHome(actor: Actor) {
  assertCan(actor, "editor:access");
  const scope = projectScope(actor);
  const now = new Date();
  const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [projects, tasksToday, deadlines, revisions, newFiles, awaitingReview] = await Promise.all([
    db.project.findMany({ where: { AND: [scope, { status: { in: ["QUEUED", "EDITING", "REVISION", "INTERNAL_REVIEW", "AWAITING_ASSETS", "ONBOARDING", "CLIENT_REVIEW", "FINAL_REVIEW"] } }] }, orderBy: [{ deadline: { sort: "asc", nulls: "last" } }], select: { id: true, name: true, code: true, status: true, priority: true, deadline: true, client: { select: { companyName: true } } } }),
    db.task.findMany({ where: { workspaceId: actor.workspaceId, assigneeId: actor.userId, status: { not: "COMPLETE" }, parentId: null, OR: [{ dueDate: { lt: eod } }, { status: "IN_PROGRESS" }] }, orderBy: { dueDate: "asc" }, take: 20, include: { project: { select: { id: true, name: true, code: true } } } }),
    db.project.findMany({ where: { AND: [scope, { status: { in: OPEN as any }, deadline: { gte: now, lte: addDays(now, 10) } }] }, orderBy: { deadline: "asc" }, take: 6, select: { id: true, name: true, code: true, deadline: true } }),
    db.revisionRequest.findMany({ where: { project: scope, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 10, include: { project: { select: { id: true, name: true, code: true } }, version: { select: { label: true } }, _count: { select: { comments: true } } } }),
    db.asset.findMany({ where: { project: scope, deletedAt: null, status: "READY", createdAt: { gte: addDays(now, -3) }, uploadedBy: { isStaff: false }, folder: { key: { notIn: ["drafts", "final-exports"] } } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, displayName: true, createdAt: true, project: { select: { id: true, name: true } } } }),
    db.project.findMany({ where: { AND: [scope, { status: { in: ["INTERNAL_REVIEW", "CLIENT_REVIEW", "FINAL_REVIEW"] } }] }, select: { id: true, name: true, code: true, status: true }, take: 8 }),
  ]);
  return { projects: projects.map((p) => ({ ...p, status: p.status as ProjectStatusKey })), tasksToday, deadlines, revisions, newFiles, awaitingReview: awaitingReview.map((p) => ({ ...p, status: p.status as ProjectStatusKey })) };
}
