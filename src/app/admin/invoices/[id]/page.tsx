import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getInvoice } from "@/server/services/invoices";
import { listNotes } from "@/server/services/notes";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { InvoiceBadge } from "@/components/portal/common";
import { DocLines } from "@/components/portal/doc-lines";
import { InvoiceActions } from "@/components/admin/doc-actions";
import { NotesPanel } from "@/components/admin/notes-panel";
import { PrintButton } from "@/components/portal/print-button";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoiceAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("admin", `/admin/invoices/${id}`);
  const inv = await guard(() => getInvoice(actor, id));
  const due = inv.total - inv.amountPaid;
  return (
    <>
      <div className="mb-2"><Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Invoices</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{inv.number}<InvoiceBadge value={inv.status} /></span>}
        description={<>{inv.client.companyName}{inv.project ? <> · <Link className="font-semibold text-fg hover:underline" href={`/admin/projects/${inv.project.id}`}>{inv.project.code} {inv.project.name}</Link></> : null}{inv.quote ? <> · from <Link className="font-semibold text-fg hover:underline" href={`/admin/quotes/${inv.quote.id}`}>{inv.quote.number}</Link></> : null}</>}
        actions={<><PrintButton /><InvoiceActions id={id} status={inv.status} due={due} currency={inv.currency} canWrite={can(actor, "invoices:write")} canPay={can(actor, "payments:write")} /></>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-6 sm:p-8">
          <DocLines items={inv.items} currency={inv.currency} subtotal={inv.subtotal} discount={inv.discount} tax={inv.tax} total={inv.total} amountPaid={inv.amountPaid} />
          {inv.notes ? <p className="mt-6 whitespace-pre-wrap text-sm text-muted">{inv.notes}</p> : null}
        </Card>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="Payments" description={due > 0 ? `${formatMoney(due, inv.currency)} outstanding` : "Paid in full"} />
            {inv.payments.length ? <ul className="divide-y divide-line">{inv.payments.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span><span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span><span className="block text-xs text-muted">{p.method ?? p.provider} · {p.paidAt ? formatDateTime(p.paidAt) : "—"}</span></span><span className={p.status === "SUCCEEDED" ? "text-xs font-bold text-success" : "text-xs font-bold text-danger"}>{p.status.toLowerCase()}</span></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">No payments yet.</p>}
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Issued</dt><dd>{inv.issuedAt ? formatDate(inv.issuedAt) : "Draft"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Due</dt><dd>{inv.dueDate ? formatDate(inv.dueDate) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Viewed by client</dt><dd>{inv.viewedAt ? formatDateTime(inv.viewedAt) : "Not yet"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Type</dt><dd className="capitalize">{inv.kind.toLowerCase().replace("_", " ")}</dd></div>
            </dl>
          </Card>
          {can(actor, "notes:read") ? <NotesPanel entityType="INVOICE" entityId={id} notes={(await listNotes(actor, "INVOICE", id)) as any} canWrite={can(actor, "notes:write")} /> : null}
        </aside>
      </div>
    </>
  );
}
