import { requirePageActor } from "@/server/auth/actor";
import { listQuotes } from "@/server/services/quotes";
import { first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination } from "@/components/ui/table";
import { QuoteBadge } from "@/components/portal/common";
import { formatDateShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Quotes", path: "/dashboard/quotes", noindex: true });

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/quotes");
  const sp = await searchParams;
  const res = await listQuotes(actor, { page: num(sp.page) });
  return (
    <>
      <PageHeader title="Quotes" description="Review and accept proposals for your projects." />
      <Card>
        <DataTable
          rows={res.items}
          rowKey={(q) => q.id}
          rowHref={(q) => `/dashboard/quotes/${q.id}`}
          empty={<EmptyState icon="clipboard" title="No quotes yet" description="When we prepare a proposal for you, it will appear here for review." />}
          columns={[
            { key: "n", header: "Quote", primary: true, render: (q) => <span className="font-bold">{q.number}</span> },
            { key: "t", header: "Project", render: (q) => q.project?.name ?? q.title ?? "—" },
            { key: "s", header: "Status", render: (q) => <QuoteBadge value={q.status} /> },
            { key: "v", header: "Valid until", hideOnMobile: true, render: (q) => (q.validUntil ? formatDateShort(q.validUntil) : "—") },
            { key: "a", header: "Total", align: "right", render: (q) => <span className="font-semibold tabular-nums">{formatMoney(q.total, q.currency)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/dashboard/quotes" />
      </Card>
    </>
  );
}
