import { requirePageActor, can } from "@/server/auth/actor";
import { listQuotes } from "@/server/services/quotes";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { QuoteBadge } from "@/components/portal/common";
import { QUOTE_STATUS_META } from "@/lib/statuses";
import { formatDateShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Quotes", path: "/admin/quotes", noindex: true });

export default async function QuotesAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/quotes");
  const sp = await searchParams;
  const f = { q: first(sp.q), status: first(sp.status) };
  const res = await guard(() => listQuotes(actor, { ...f, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Quotes" description="Proposals from draft to accepted." actions={can(actor, "quotes:write") ? <ButtonLink href="/admin/quotes/new" icon="plus" variant="dark">New quote</ButtonLink> : null} />
      <Card>
        <FilterBar action="/admin/quotes" values={f} fields={[{ name: "q", label: "Search quotes", placeholder: "Search number, client, title…" }, { name: "status", label: "Status", type: "select", options: Object.entries(QUOTE_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]} />
        <DataTable
          rows={res.items}
          rowKey={(q) => q.id}
          rowHref={(q) => `/admin/quotes/${q.id}`}
          empty={<EmptyState icon="clipboard" title={f.q || f.status ? "No quotes match" : "No quotes yet"} description="Create a quote from a lead, client or project." action={can(actor, "quotes:write") ? <ButtonLink href="/admin/quotes/new">New quote</ButtonLink> : undefined} />}
          columns={[
            { key: "n", header: "Quote", primary: true, render: (q) => <span><span className="font-bold">{q.number}</span><span className="block text-xs font-normal text-muted">{q.title ?? q.project?.name ?? ""}</span></span> },
            { key: "c", header: "Client", render: (q) => q.client.companyName },
            { key: "s", header: "Status", render: (q) => <QuoteBadge value={q.status} /> },
            { key: "v", header: "Valid until", hideOnMobile: true, render: (q) => (q.validUntil ? formatDateShort(q.validUntil) : "—") },
            { key: "a", header: "Total", align: "right", render: (q) => <span className="font-semibold tabular-nums">{formatMoney(q.total, q.currency)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/quotes" params={f} />
      </Card>
    </>
  );
}
