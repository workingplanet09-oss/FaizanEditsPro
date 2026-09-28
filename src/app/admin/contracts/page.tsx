import { requirePageActor } from "@/server/auth/actor";
import { listContracts } from "@/server/services/contracts";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { ContractBadge } from "@/components/portal/common";
import { CONTRACT_STATUS_META } from "@/lib/statuses";
import { formatDateShort } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Contracts", path: "/admin/contracts", noindex: true });

export default async function ContractsAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/contracts");
  const sp = await searchParams;
  const f = { q: first(sp.q), status: first(sp.status) };
  const res = await guard(() => listContracts(actor, { ...f, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Contracts" description="Agreements are drafted automatically when a quote is accepted. Review, send and track signatures here." />
      <Card>
        <FilterBar action="/admin/contracts" values={f} fields={[{ name: "q", label: "Search contracts", placeholder: "Search number, title, client…" }, { name: "status", label: "Status", type: "select", options: Object.entries(CONTRACT_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]} />
        <DataTable
          rows={res.items}
          rowKey={(c) => c.id}
          rowHref={(c) => `/admin/contracts/${c.id}`}
          empty={<EmptyState icon="sign" title={f.q || f.status ? "No contracts match" : "No contracts yet"} description="A draft contract is created the moment a client accepts a quote." />}
          columns={[
            { key: "n", header: "Contract", primary: true, render: (c) => <span><span className="font-bold">{c.number}</span><span className="block text-xs font-normal text-muted">{c.title}</span></span> },
            { key: "c", header: "Client", render: (c) => c.client.companyName },
            { key: "p", header: "Project", hideOnMobile: true, render: (c) => c.project.code },
            { key: "s", header: "Status", render: (c) => <ContractBadge value={c.status} /> },
            { key: "d", header: "Signed", hideOnMobile: true, align: "right", render: (c) => (c.signedAt ? formatDateShort(c.signedAt) : "—") },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/contracts" params={f} />
      </Card>
    </>
  );
}
