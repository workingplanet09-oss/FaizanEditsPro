import { db } from "../db";
import { AppError } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { formatMoney } from "@/lib/money";
import { addDays } from "./common";

type Cell = string | number | boolean | Date | null | undefined;

/** RFC-4180 CSV with spreadsheet-formula injection defence. `excel: true` adds a BOM + CRLF so Excel opens UTF-8 correctly. */
export function toCsv(columns: string[], rows: Cell[][], excel = true): string {
  const esc = (v: Cell) => {
    let s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise formulas
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const eol = excel ? "\r\n" : "\n";
  return (excel ? "﻿" : "") + [columns, ...rows].map((r) => r.map(esc).join(",")).join(eol) + eol;
}

export interface ExportRange {
  from?: Date;
  to?: Date;
}

const range = (r: ExportRange) => ({ ...(r.from || r.to ? { createdAt: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } } : {}) });
const money = (n: number, c: string) => (n / 100).toFixed(2) + " " + c;

const BUILDERS: Record<string, { perm: string; build: (a: Actor, r: ExportRange) => Promise<{ columns: string[]; rows: Cell[][] }> }> = {
  leads: {
    perm: "leads:read",
    build: async (a, r) => {
      const rows = await db.lead.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000, include: { source: true, assignedTo: { select: { name: true } } } });
      return { columns: ["Request ID", "Name", "Company", "Email", "Phone", "Status", "Temperature", "Budget", "Looking for", "Source", "UTM source", "UTM medium", "UTM campaign", "Assigned to", "Created"], rows: rows.map((l) => [l.requestCode, l.name, l.company, l.email, l.phone, l.status, l.temperatureOverride ?? l.temperature, l.budgetRange, l.lookingFor, l.source?.label, l.utmSource, l.utmMedium, l.utmCampaign, l.assignedTo?.name, l.createdAt]) };
    },
  },
  clients: {
    perm: "clients:read",
    build: async (a, r) => {
      const rows = await db.client.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000, include: { _count: { select: { projects: true } } } });
      return { columns: ["Company", "Contact", "Email", "Phone", "Industry", "Website", "Country", "Status", "Source", "Projects", "Created"], rows: rows.map((c) => [c.companyName, c.name, c.email, c.phone, c.industry, c.website, c.country, c.status, c.source, c._count.projects, c.createdAt]) };
    },
  },
  projects: {
    perm: "projects:read_all",
    build: async (a, r) => {
      const rows = await db.project.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000, include: { client: { select: { companyName: true } }, manager: { select: { name: true } }, service: { select: { title: true } } } });
      return { columns: ["Code", "Project", "Client", "Service", "Status", "Priority", "Manager", "Deadline", "Revisions used", "Created", "Delivered"], rows: rows.map((p) => [p.code, p.name, p.client.companyName, p.service?.title, p.status, p.priority, p.manager?.name, p.deadline, p.revisionsUsed, p.createdAt, p.deliveredAt]) };
    },
  },
  invoices: {
    perm: "invoices:read",
    build: async (a, r) => {
      const rows = await db.invoice.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000, include: { client: { select: { companyName: true } }, project: { select: { code: true } } } });
      return { columns: ["Invoice", "Client", "Project", "Kind", "Currency", "Total", "Paid", "Status", "Issued", "Due", "Paid at"], rows: rows.map((i) => [i.number, i.client.companyName, i.project?.code, i.kind, i.currency, (i.total / 100).toFixed(2), (i.amountPaid / 100).toFixed(2), i.status, i.issuedAt, i.dueDate, i.paidAt]) };
    },
  },
  payments: {
    perm: "payments:read",
    build: async (a, r) => {
      const rows = await db.payment.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000, include: { invoice: { select: { number: true } }, client: { select: { companyName: true } } } });
      return { columns: ["Payment ID", "Invoice", "Client", "Amount", "Currency", "Provider", "Transaction", "Status", "Paid at"], rows: rows.map((p) => [p.id, p.invoice.number, p.client.companyName, (p.amount / 100).toFixed(2), p.currency, p.provider, p.transactionId, p.status, p.paidAt]) };
    },
  },
  testimonials: {
    perm: "cms:manage",
    build: async (a, r) => {
      const rows = await db.testimonial.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, orderBy: { createdAt: "desc" }, take: 20000 });
      return { columns: ["Name", "Role", "Company", "Rating", "Quote", "Status", "Permission to publish", "Created"], rows: rows.map((t) => [t.name, t.role, t.company, t.rating, t.quote, t.status, t.permissionToPublish ? "yes" : "no", t.createdAt]) };
    },
  },
  // ── reports ──
  "report-monthly-revenue": {
    perm: "analytics:read",
    build: async (a, r) => {
      const rows = await db.payment.findMany({ where: { workspaceId: a.workspaceId, status: "SUCCEEDED", ...(r.from || r.to ? { paidAt: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } } : {}) }, select: { amount: true, currency: true, paidAt: true } });
      const m = new Map<string, { n: number; total: number }>();
      for (const p of rows) {
        const k = `${p.paidAt!.toISOString().slice(0, 7)}|${p.currency}`;
        const e = m.get(k) ?? { n: 0, total: 0 };
        e.n++;
        e.total += p.amount;
        m.set(k, e);
      }
      return { columns: ["Month", "Currency", "Payments", "Revenue"], rows: [...m.entries()].sort().map(([k, v]) => { const [month, cur] = k.split("|"); return [month, cur, v.n, (v.total / 100).toFixed(2)]; }) };
    },
  },
  "report-client-acquisition": {
    perm: "analytics:read",
    build: async (a, r) => {
      const rows = await db.lead.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, select: { createdAt: true, status: true, source: { select: { label: true } } } });
      const m = new Map<string, { leads: number; converted: number }>();
      for (const l of rows) {
        const k = `${l.createdAt.toISOString().slice(0, 7)}|${l.source?.label ?? "Unknown"}`;
        const e = m.get(k) ?? { leads: 0, converted: 0 };
        e.leads++;
        if (l.status === "CONVERTED") e.converted++;
        m.set(k, e);
      }
      return { columns: ["Month", "Source", "Leads", "Converted", "Conversion %"], rows: [...m.entries()].sort().map(([k, v]) => { const [month, src] = k.split("|"); return [month, src, v.leads, v.converted, v.leads ? ((v.converted / v.leads) * 100).toFixed(1) : "0"]; }) };
    },
  },
  "report-project-performance": {
    perm: "analytics:read",
    build: async (a, r) => {
      const rows = await db.project.findMany({ where: { workspaceId: a.workspaceId, ...range(r) }, include: { client: { select: { companyName: true } }, service: { select: { title: true } }, _count: { select: { versions: true } } } });
      return { columns: ["Code", "Project", "Client", "Service", "Status", "Started", "Delivered", "Days to deliver", "Versions", "Revision rounds", "Deadline met"], rows: rows.map((p) => { const days = p.startDate && p.deliveredAt ? ((p.deliveredAt.getTime() - p.startDate.getTime()) / 86400000).toFixed(1) : ""; return [p.code, p.name, p.client.companyName, p.service?.title, p.status, p.startDate, p.deliveredAt, days, p._count.versions, p.revisionsUsed, p.deadline && p.deliveredAt ? (p.deliveredAt <= addDays(p.deadline, 1) ? "yes" : "no") : ""]; }) };
    },
  },
  "report-editing-services": {
    perm: "analytics:read",
    build: async (a, r) => {
      const rows = await db.project.groupBy({ by: ["serviceId"], where: { workspaceId: a.workspaceId, ...range(r) }, _count: { _all: true } });
      const svcs = await db.service.findMany({ where: { workspaceId: a.workspaceId } });
      const nm = new Map(svcs.map((s) => [s.id, s.title]));
      return { columns: ["Service", "Projects"], rows: rows.map((x) => [x.serviceId ? nm.get(x.serviceId) ?? "Unknown" : "Unspecified", x._count._all]) };
    },
  },
  "report-outstanding-invoices": {
    perm: "invoices:read",
    build: async (a) => {
      const rows = await db.invoice.findMany({ where: { workspaceId: a.workspaceId, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: { dueDate: "asc" }, include: { client: { select: { companyName: true } } } });
      return { columns: ["Invoice", "Client", "Status", "Currency", "Total", "Paid", "Outstanding", "Due", "Days overdue"], rows: rows.map((i) => [i.number, i.client.companyName, i.status, i.currency, (i.total / 100).toFixed(2), (i.amountPaid / 100).toFixed(2), ((i.total - i.amountPaid) / 100).toFixed(2), i.dueDate, i.dueDate && i.dueDate < new Date() ? Math.floor((Date.now() - i.dueDate.getTime()) / 86400000) : 0]) };
    },
  },
  "report-team-workload": {
    perm: "analytics:read",
    build: async (a) => {
      const users = await db.user.findMany({ where: { workspaceId: a.workspaceId, isStaff: true, status: "ACTIVE" }, select: { id: true, name: true } });
      const rows: Cell[][] = [];
      for (const u of users) {
        const [p, t, h] = await Promise.all([
          db.project.count({ where: { workspaceId: a.workspaceId, status: { notIn: ["DELIVERED", "ARCHIVED", "CANCELLED"] }, members: { some: { userId: u.id } } } }),
          db.task.count({ where: { workspaceId: a.workspaceId, assigneeId: u.id, status: { not: "COMPLETE" } } }),
          db.timeEntry.aggregate({ where: { workspaceId: a.workspaceId, userId: u.id }, _sum: { seconds: true } }),
        ]);
        rows.push([u.name, p, t, ((h._sum.seconds ?? 0) / 3600).toFixed(1)]);
      }
      return { columns: ["Team member", "Open projects", "Open tasks", "Tracked hours (all time)"], rows };
    },
  },
};

export const EXPORT_KEYS = Object.keys(BUILDERS);

export async function runExport(actor: Actor, key: string, r: ExportRange = {}, excel = true) {
  const b = BUILDERS[key];
  if (!b) throw new AppError("NOT_FOUND", "Unknown export.");
  assertCan(actor, "reports:export");
  assertCan(actor, b.perm);
  const { columns, rows } = await b.build(actor, r);
  await audit(actor, { workspaceId: actor.workspaceId, action: "export.run", entityType: "export", entityId: key, message: `${actor.name} exported ${key} (${rows.length} rows)` });
  return { csv: toCsv(columns, rows, excel), filename: `${key}-${new Date().toISOString().slice(0, 10)}.csv`, rows: rows.length };
}

export { formatMoney, money };
