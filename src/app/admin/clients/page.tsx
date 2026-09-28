import { requirePageActor, can } from "@/server/auth/actor";
import { listClients } from "@/server/services/clients";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { TabNav } from "@/components/ui/tabs";
import { ClientStatusBadge } from "@/components/portal/common";
import { timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Clients", path: "/admin/clients", noindex: true });

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/clients");
  const sp = await searchParams;
  const section = (first(sp.section) ?? "active") as "active" | "inactive" | "retainers" | "prospects" | "all";
  const q = first(sp.q);
  const sort = first(sp.sort);
  const res = await guard(() => listClients(actor, { section: section === "all" ? undefined : section, q, sort, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Clients" description="Everyone you work with, in one place." actions={can(actor, "clients:write") ? <ButtonLink href="/admin/clients/new" icon="plus" variant="dark">New client</ButtonLink> : null} />
      <TabNav basePath="/admin/clients" param="section" active={section} tabs={[{ key: "active", label: "Active" }, { key: "prospects", label: "Prospects" }, { key: "retainers", label: "Retainers" }, { key: "inactive", label: "Inactive" }, { key: "all", label: "All" }]} extra={{ q, sort }} />
      <Card>
        <FilterBar action="/admin/clients" values={{ q, sort }} fields={[{ name: "q", label: "Search clients", placeholder: "Search name, company, email…" }, { name: "sort", label: "Sort", type: "select", options: [{ value: "name", label: "Company A–Z" }, { value: "oldest", label: "Oldest first" }] }]}><input type="hidden" name="section" value={section} /></FilterBar>
        <DataTable
          rows={res.items}
          rowKey={(c) => c.id}
          rowHref={(c) => `/admin/clients/${c.id}`}
          empty={<EmptyState icon="building" title={q ? "No clients match your search" : "No clients here yet"} description={q ? "Try a different search." : "Clients appear when you convert a lead or add one manually."} action={can(actor, "clients:write") && !q ? <ButtonLink href="/admin/clients/new">Add a client</ButtonLink> : undefined} />}
          columns={[
            { key: "c", header: "Company", primary: true, render: (c) => <span><span className="font-bold">{c.companyName}</span><span className="block text-xs font-normal text-muted">{c.name} · {c.email}</span></span> },
            { key: "s", header: "Status", render: (c) => <ClientStatusBadge value={c.status} /> },
            { key: "i", header: "Industry", hideOnMobile: true, render: (c) => c.industry ?? "—" },
            { key: "p", header: "Projects", hideOnMobile: true, render: (c) => `${c.activeProjects} active · ${c.totalProjects} total` },
            { key: "m", header: "Manager", hideOnMobile: true, render: (c) => c.manager?.name ?? <span className="text-subtle">—</span> },
            { key: "u", header: "Updated", align: "right", render: (c) => <span className="text-muted">{timeAgo(c.updatedAt)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/clients" params={{ q, sort, section: section === "active" ? undefined : section }} />
      </Card>
    </>
  );
}
