import { requirePageActor } from "@/server/auth/actor";
import { listInvoices } from "@/server/services/invoices";
import { first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination } from "@/components/ui/table";
import { TabNav } from "@/components/ui/tabs";
import { InvoiceBadge } from "@/components/portal/common";
import { formatDateShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Invoices", path: "/dashboard/invoices", noindex: true });

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/invoices");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "all";
  const res = await listInvoices(actor, { page: num(sp.page), status: tab === "paid" ? "PAID" : undefined });
  const rows = tab === "due" ? res.items.filter((i) => ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)) : res.items;
  const outstanding = res.items.filter((i) => ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).reduce((s, i) => s + (i.total - i.amountPaid), 0);
  return (
    <>
      <PageHeader title="Invoices" description={outstanding ? `${formatMoney(outstanding, res.items[0]?.currency ?? "USD")} outstanding` : "Everything you've been billed, and every receipt."} />
      <TabNav basePath="/dashboard/invoices" active={tab} tabs={[{ key: "all", label: "All" }, { key: "due", label: "Due" }, { key: "paid", label: "Paid" }]} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(i) => i.id}
          rowHref={(i) => `/dashboard/invoices/${i.id}`}
          empty={<EmptyState icon="receipt" title={tab === "due" ? "Nothing to pay" : "No invoices yet"} description={tab === "due" ? "You're all paid up." : "Invoices appear here once your contract is signed."} />}
          columns={[
            { key: "n", header: "Invoice", primary: true, render: (i) => <span className="font-bold">{i.number}</span> },
            { key: "p", header: "Project", render: (i) => i.project?.name ?? "—" },
            { key: "k", header: "Type", hideOnMobile: true, render: (i) => <span className="capitalize">{i.kind.toLowerCase()}</span> },
            { key: "d", header: "Due", hideOnMobile: true, render: (i) => (i.dueDate ? formatDateShort(i.dueDate) : "—") },
            { key: "s", header: "Status", render: (i) => <InvoiceBadge value={i.status} /> },
            { key: "a", header: "Amount", align: "right", render: (i) => <span className="font-semibold tabular-nums">{formatMoney(i.total, i.currency)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/dashboard/invoices" params={{ tab: tab === "all" ? undefined : tab }} />
      </Card>
    </>
  );
}
