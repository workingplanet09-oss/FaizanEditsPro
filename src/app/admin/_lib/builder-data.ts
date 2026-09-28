import type { Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { listClients } from "@/server/services/clients";
import { getSettings } from "@/server/services/settings";

/** Everything the quote / invoice builders need in one call. */
export async function builderData(actor: Actor) {
  const ws = actor.workspaceId;
  const [clients, projects, services, s] = await Promise.all([
    listClients(actor, { pageSize: 200, sort: "name" }),
    db.project.findMany({ where: { workspaceId: ws, status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 400, select: { id: true, name: true, code: true, clientId: true } }),
    db.service.findMany({ where: { workspaceId: ws }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, startingPrice: true } }),
    getSettings(ws, ["business", "quote", "invoice"]),
  ]);
  return {
    clients: clients.items.map((c) => ({ id: c.id, label: `${c.companyName} — ${c.name}` })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}`, clientId: p.clientId })),
    services: services.map((x) => ({ id: x.id, label: x.title, price: x.startingPrice })),
    currencies: s.business.currencies,
    business: s.business,
    quote: s.quote,
    invoice: s.invoice,
  };
}
