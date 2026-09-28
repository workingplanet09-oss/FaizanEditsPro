import { requirePageActor, can } from "@/server/auth/actor";
import { listInvoices } from "@/server/services/invoices";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { InvoiceBadge } from "@/components/portal/common";
import { INVOICE_STATUS_META } from "@/lib/statuses";
import { formatDateShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Invoices", path: "/admin/invoices", noindex: true });

export default async function InvoicesAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/invoices");
  const sp = await searchParams;
  const f = { q: first(sp.q), status: first(sp.status) };
  const res = await guard(() => listInvoices(actor, { ...f, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Invoices" description="Track what's been billed and what's been paid." actions={can(actor, "invoices:write") ? <ButtonLink href="/admin/invoices/new" icon="plus" variant="dark">New invoice</ButtonLink> : null} />
      <Card>
        <FilterBar action="/admin/invoices" values={f} fields={[{ name: "q", label: "Search invoices", placeholder: "Search number or client…" }, { name: "status", label: "Status", type: "select", options: Object.entries(INVOICE_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]} />
        <DataTable
          rows={res.items}
          rowKey={(i) => i.id}
          rowHref={(i) => `/admin/invoices/${i.id}`}
          empty={<EmptyState icon="receipt" title={f.q || f.status ? "No invoices match" : "No invoices yet"} description="Invoices are created automatically from accepted quotes, or manually here." action={can(actor, "invoices:write") ? <ButtonLink href="/admin/invoices/new">New invoice</ButtonLink> : undefined} />}
          columns={[
            { key: "n", header: "Invoice", primary: true, render: (i) => <span><span className="font-bold">{i.number}</span><span className="block text-xs font-normal capitalize text-muted">{i.kind.toLowerCase().replace("_", " ")}</span></span> },
            { key: "c", header: "Client", render: (i) => i.client.companyName },
            { key: "p", header: "Project", hideOnMobile: true, render: (i) => i.project?.code ?? "—" },
            { key: "d", header: "Due", hideOnMobile: true, render: (i) => (i.dueDate ? formatDateShort(i.dueDate) : "—") },
            { key: "s", header: "Status", render: (i) => <InvoiceBadge value={i.status} /> },
            { key: "a", header: "Amount", align: "right", render: (i) => <span className="font-semibold tabular-nums">{formatMoney(i.total, i.currency)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/invoices" params={f} />
      </Card>
    </>
  );
}
