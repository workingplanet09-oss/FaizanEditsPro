import Link from "next/link";
import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { first, type SearchParams } from "@/server/page";
import { db } from "@/server/db";
import { listAssignable } from "@/server/services/projects";
import { listClients } from "@/server/services/clients";
import { getSetting } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/primitives";
import { NewProjectForm } from "@/components/admin/new-project-form";

export const metadata = { title: "New project", robots: { index: false, follow: false } };

export default async function NewProjectPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/projects/new");
  if (!can(actor, "projects:write")) denyPage();
  const sp = await searchParams;
  const ws = actor.workspaceId;
  const [clients, services, types, templates, staff, business] = await Promise.all([
    listClients(actor, { pageSize: 200, sort: "name" }),
    db.service.findMany({ where: { workspaceId: ws }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }),
    db.projectType.findMany({ where: { workspaceId: ws }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
    db.projectTemplate.findMany({ where: { workspaceId: ws }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    can(actor, "projects:assign") ? listAssignable(actor) : Promise.resolve([]),
    getSetting(ws, "business"),
  ]);
  return (
    <>
      <div className="mb-2"><Link href="/admin/projects" className="text-sm font-semibold text-muted hover:text-fg">← Projects</Link></div>
      <PageHeader title="New project" description="Create a project for an existing client. To start from an inquiry, convert the lead instead." />
      <NewProjectForm
        clients={clients.items.map((c) => ({ id: c.id, label: `${c.companyName} — ${c.name}` }))}
        services={services.map((s) => ({ id: s.id, label: s.title }))}
        types={types.map((t) => ({ key: t.key, label: t.name }))}
        templates={templates.map((t) => ({ id: t.id, label: t.name }))}
        staff={staff.map((s) => ({ id: s.id, label: s.name }))}
        defaults={{ clientId: first(sp.clientId), managerId: actor.userId, currency: business.defaultCurrency }}
        currencies={business.currencies}
      />
    </>
  );
}
