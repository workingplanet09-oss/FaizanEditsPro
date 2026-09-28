import { db } from "../db";
import { can, type Actor } from "../auth/actor";
import { assetScope, clientScope, contractScope, invoiceScope, leadScope, messageScope, projectScope, quoteScope } from "../auth/access";

export type SearchKind = "client" | "lead" | "project" | "invoice" | "quote" | "contract" | "file" | "message";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Permission-scoped global search: each entity type is only searched if the actor may read it. */
export async function globalSearch(actor: Actor, q: string, kinds?: SearchKind[], perKind = 6): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2 || !actor.isStaff) return [];
  const want = (k: SearchKind) => !kinds?.length || kinds.includes(k);
  const ci = { contains: term, mode: "insensitive" as const };
  const tasks: Promise<SearchHit[]>[] = [];

  if (want("client") && can(actor, "clients:read"))
    tasks.push(db.client.findMany({ where: { AND: [clientScope(actor), { OR: [{ name: ci }, { companyName: ci }, { email: ci }] }] }, take: perKind, orderBy: { updatedAt: "desc" } }).then((r) => r.map((c) => ({ kind: "client" as const, id: c.id, title: c.companyName, subtitle: `${c.name} · ${c.email}`, href: `/admin/clients/${c.id}` }))));
  if (want("lead") && can(actor, "leads:read"))
    tasks.push(db.lead.findMany({ where: { AND: [leadScope(actor), { OR: [{ name: ci }, { company: ci }, { email: ci }, { requestCode: ci }] }] }, take: perKind, orderBy: { createdAt: "desc" } }).then((r) => r.map((l) => ({ kind: "lead" as const, id: l.id, title: l.company || l.name, subtitle: `${l.requestCode} · ${l.status.toLowerCase().replace("_", " ")}`, href: `/admin/leads/${l.id}` }))));
  if (want("project"))
    tasks.push(db.project.findMany({ where: { AND: [projectScope(actor), { OR: [{ name: ci }, { code: ci }, { client: { companyName: ci } }] }] }, take: perKind, orderBy: { updatedAt: "desc" }, include: { client: { select: { companyName: true } } } }).then((r) => r.map((p) => ({ kind: "project" as const, id: p.id, title: p.name, subtitle: `${p.code} · ${p.client.companyName}`, href: `${can(actor, "admin:access") ? "/admin" : "/editor"}/projects/${p.id}` }))));
  if (want("invoice") && can(actor, "invoices:read"))
    tasks.push(db.invoice.findMany({ where: { AND: [invoiceScope(actor), { OR: [{ number: ci }, { client: { companyName: ci } }] }] }, take: perKind, orderBy: { createdAt: "desc" }, include: { client: { select: { companyName: true } } } }).then((r) => r.map((i) => ({ kind: "invoice" as const, id: i.id, title: `Invoice ${i.number}`, subtitle: `${i.client.companyName} · ${i.status.toLowerCase().replace("_", " ")}`, href: `/admin/invoices/${i.id}` }))));
  if (want("quote") && can(actor, "quotes:read"))
    tasks.push(db.quote.findMany({ where: { AND: [quoteScope(actor), { OR: [{ number: ci }, { title: ci }, { client: { companyName: ci } }] }] }, take: perKind, orderBy: { createdAt: "desc" }, include: { client: { select: { companyName: true } } } }).then((r) => r.map((qq) => ({ kind: "quote" as const, id: qq.id, title: `Quote ${qq.number}`, subtitle: `${qq.client.companyName} · ${qq.status.toLowerCase()}`, href: `/admin/quotes/${qq.id}` }))));
  if (want("contract") && can(actor, "contracts:read"))
    tasks.push(db.contract.findMany({ where: { AND: [contractScope(actor), { OR: [{ number: ci }, { title: ci }, { client: { companyName: ci } }] }] }, take: perKind, orderBy: { createdAt: "desc" }, include: { client: { select: { companyName: true } } } }).then((r) => r.map((c) => ({ kind: "contract" as const, id: c.id, title: `Contract ${c.number}`, subtitle: `${c.client.companyName} · ${c.status.toLowerCase()}`, href: `/admin/contracts/${c.id}` }))));
  if (want("file") && can(actor, "files:read"))
    tasks.push(db.asset.findMany({ where: { AND: [assetScope(actor), { displayName: ci }, { projectId: { not: null } }] }, take: perKind, orderBy: { createdAt: "desc" }, include: { project: { select: { id: true, name: true } } } }).then((r) => r.map((a) => ({ kind: "file" as const, id: a.id, title: a.displayName, subtitle: a.project?.name ?? "", href: `${can(actor, "admin:access") ? "/admin" : "/editor"}/projects/${a.projectId}?tab=files` }))));
  if (want("message") && can(actor, "messages:read"))
    tasks.push(db.message.findMany({ where: { AND: [messageScope(actor), { body: ci }] }, take: perKind, orderBy: { createdAt: "desc" }, include: { sender: { select: { name: true } }, project: { select: { name: true } } } }).then((r) => r.map((m) => ({ kind: "message" as const, id: m.id, title: m.body.slice(0, 80), subtitle: `${m.sender.name}${m.project ? ` · ${m.project.name}` : ""}`, href: m.projectId ? `/admin/projects/${m.projectId}?tab=messages` : "/admin/messages" }))));

  return (await Promise.all(tasks)).flat();
}
