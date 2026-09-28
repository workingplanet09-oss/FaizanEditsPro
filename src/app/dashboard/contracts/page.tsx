import { requirePageActor } from "@/server/auth/actor";
import { listContracts } from "@/server/services/contracts";
import { num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination } from "@/components/ui/table";
import { ContractBadge } from "@/components/portal/common";
import { formatDateShort } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Contracts", path: "/dashboard/contracts", noindex: true });

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/contracts");
  const sp = await searchParams;
  const res = await listContracts(actor, { page: num(sp.page) });
  return (
    <>
      <PageHeader title="Contracts" description="Your signed agreements are stored here for good." />
      <Card>
        <DataTable
          rows={res.items}
          rowKey={(c) => c.id}
          rowHref={(c) => `/dashboard/contracts/${c.id}`}
          empty={<EmptyState icon="sign" title="No contracts yet" description="After you accept a quote, your agreement will appear here to sign." />}
          columns={[
            { key: "n", header: "Contract", primary: true, render: (c) => <span className="font-bold">{c.number}</span> },
            { key: "p", header: "Project", render: (c) => c.project.name },
            { key: "s", header: "Status", render: (c) => <ContractBadge value={c.status} /> },
            { key: "d", header: "Signed", hideOnMobile: true, render: (c) => (c.signedAt ? formatDateShort(c.signedAt) : "—") },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/dashboard/contracts" />
      </Card>
    </>
  );
}
