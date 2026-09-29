import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { guard, first, type SearchParams } from "@/server/page";
import { getInvoice } from "@/server/services/invoices";
import { getSetting } from "@/server/services/settings";
import { env } from "@/server/env";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { InvoiceBadge } from "@/components/portal/common";
import { DocLines } from "@/components/portal/doc-lines";
import { PayPanel } from "@/components/portal/pay-panel";
import { PrintButton } from "@/components/portal/print-button";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { orgRoleCan } from "@/lib/permissions";

export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePageActor("client", `/dashboard/invoices/${id}`);
  const inv = await guard(() => getInvoice(actor, id, { markViewed: true }));
  const business = await getSetting(actor.workspaceId, "business");
  const due = inv.total - inv.amountPaid;
  const payable = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  const canPay = actor.orgs.some((o) => o.organizationId === inv.organizationId && orgRoleCan(o.role, "billing"));
  return (
    <>
      <div className="mb-2"><Link href="/dashboard/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg print:hidden"><Icon name="chevron-left" size={14} /> Invoices</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{inv.number} <InvoiceBadge value={inv.status} /></span>}
        description={inv.project ? <>For <Link className="font-semibold text-fg hover:underline" href={`/dashboard/projects/${inv.project.id}`}>{inv.project.name}</Link></> : undefined}
        actions={<PrintButton />}
      />
      {first(sp.paid) === "1" && inv.status === "PAID" ? <p role="status" className="mb-5 flex items-center gap-2 rounded-2xl bg-success-soft px-5 py-3.5 text-sm font-semibold text-success"><Icon name="check-circle" size={18} /> Payment received — thank you! Your project is moving forward.</p> : null}
      {first(sp.cancelled) === "1" ? <p role="status" className="mb-5 rounded-2xl bg-warning-soft px-5 py-3.5 text-sm font-semibold text-warning">Checkout was cancelled. You haven't been charged.</p> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5 sm:p-8 print:border-0 print:shadow-none">
          <div className="mb-6 flex flex-wrap justify-between gap-6 border-b border-line pb-6 text-sm">
            <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">From</div><div className="mt-1 font-bold">{business.name}</div>{business.legalName ? <div className="text-muted">{business.legalName}</div> : null}{business.address ? <div className="whitespace-pre-line text-muted">{business.address}</div> : null}{business.taxId ? <div className="text-muted">Tax ID: {business.taxId}</div> : null}</div>
            <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Billed to</div><div className="mt-1 font-bold">{inv.client.companyName}</div><div className="text-muted">{inv.client.name}</div><div className="text-muted">{inv.client.email}</div></div>
            <div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-subtle">Details</div><div className="mt-1">Issued {inv.issuedAt ? formatDate(inv.issuedAt) : "—"}</div><div className={inv.status === "OVERDUE" ? "font-bold text-danger" : ""}>Due {inv.dueDate ? formatDate(inv.dueDate) : "on receipt"}</div></div>
          </div>
          <DocLines items={inv.items} currency={inv.currency} subtotal={inv.subtotal} discount={inv.discount} tax={inv.tax} total={inv.total} amountPaid={inv.amountPaid} />
          {inv.notes ? <p className="mt-8 whitespace-pre-wrap text-sm text-muted">{inv.notes}</p> : null}
          {inv.payments.length ? (
            <div className="mt-8">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Payments</h3>
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {inv.payments.map((p) => <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2.5"><span>{p.paidAt ? formatDateTime(p.paidAt) : "—"} · <span className="text-muted">{p.method ?? p.provider}</span></span><span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)} <span className="ml-1 text-xs font-medium text-success">{p.status === "SUCCEEDED" ? "received" : p.status.toLowerCase()}</span></span></li>)}
              </ul>
            </div>
          ) : null}
        </Card>
        <aside className="space-y-4 print:hidden">
          {payable ? (
            <Card className="p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-subtle">Amount due</div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{formatMoney(due, inv.currency)}</div>
              {inv.status === "OVERDUE" ? <p className="mt-1 text-sm font-semibold text-danger">Overdue since {inv.dueDate ? formatDate(inv.dueDate) : ""}</p> : null}
              <div className="mt-5">{canPay ? <PayPanel id={inv.id} due={due} currency={inv.currency} demoCheckout={first(sp.checkout) === "demo" && env.payments.provider === "demo"} /> : <p className="text-sm text-muted">Only account owners and billing contacts can pay invoices.</p>}</div>
              <p className="mt-4 flex items-start gap-2 text-xs text-subtle"><Icon name="lock" size={13} className="mt-0.5 shrink-0" />Payments are processed securely. We never see or store your card details.</p>
            </Card>
          ) : inv.status === "PAID" ? (
            <Card className="border-success/30 bg-success-soft/40 p-5"><div className="flex items-center gap-2 font-extrabold"><Icon name="check-circle" className="text-success" /> Paid in full</div><p className="mt-1 text-sm text-muted">{inv.paidAt ? `Received ${formatDate(inv.paidAt)}.` : ""}</p></Card>
          ) : (
            <Card className="p-5 text-sm text-muted">This invoice is {inv.status.toLowerCase()}.</Card>
          )}
          <Card className="p-5 text-sm"><h3 className="font-extrabold">Question about this invoice?</h3><p className="mt-1 text-muted">Message us and we'll sort it out quickly.</p><Link href="/dashboard/messages" className="mt-2 inline-block font-semibold text-accent hover:underline">Message billing →</Link></Card>
        </aside>
      </div>
    </>
  );
}
