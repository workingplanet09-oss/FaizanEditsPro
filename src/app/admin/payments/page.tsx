import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { listPayments } from "@/server/services/invoices";
import { guard, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Payments", path: "/admin/payments", noindex: true });

export default async function PaymentsAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/payments");
  const sp = await searchParams;
  const res = await guard(() => listPayments(actor, { page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Payments" description="Every payment received or attempted. Recording is idempotent, so webhook retries never double-count." />
      <Card>
        <DataTable
          rows={res.items}
          rowKey={(p) => p.id}
          empty={<EmptyState icon="wallet" title="No payments yet" description="Payments appear here as clients pay their invoices." />}
          columns={[
            { key: "d", header: "Date", primary: true, render: (p) => <span className="font-semibold">{p.paidAt ? formatDateTime(p.paidAt) : formatDateTime(p.createdAt)}</span> },
            { key: "i", header: "Invoice", render: (p) => <Link className="font-bold hover:underline" href={`/admin/invoices/${p.invoiceId}`}>{p.invoice.number}</Link> },
            { key: "c", header: "Client", hideOnMobile: true, render: (p) => p.client.companyName },
            { key: "m", header: "Method", hideOnMobile: true, render: (p) => p.method ?? p.provider },
            { key: "s", header: "Status", render: (p) => <Badge tone={p.status === "SUCCEEDED" ? "success" : p.status === "FAILED" ? "danger" : "neutral"}>{p.status.toLowerCase()}</Badge> },
            { key: "a", header: "Amount", align: "right", render: (p) => <span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/payments" />
      </Card>
    </>
  );
}
