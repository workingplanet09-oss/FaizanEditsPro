import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getQuote } from "@/server/services/quotes";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ContractBadge, InvoiceBadge, QuoteBadge } from "@/components/portal/common";
import { DocLines } from "@/components/portal/doc-lines";
import { DocBuilder } from "@/components/admin/doc-builder";
import { builderData } from "../../_lib/builder-data";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Quote", robots: { index: false, follow: false } };

export default async function QuoteAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const actor = await requirePageActor("admin", `/admin/quotes/${id}`);
  const q = await guard(() => getQuote(actor, id));
  const canWrite = can(actor, "quotes:write");
  const editable = canWrite && !["ACCEPTED", "REJECTED", "EXPIRED"].includes(q.status);
  if (edit && editable) {
    const d = await builderData(actor);
    return (
      <>
        <div className="mb-2"><Link href={`/admin/quotes/${id}`} className="text-sm font-semibold text-muted hover:text-fg">← {q.number}</Link></div>
        <PageHeader title={`Edit ${q.number}`} description="Changes apply to the same quote; if it was already sent the client sees the update." />
        <DocBuilder mode="quote" clients={d.clients} projects={d.projects} services={d.services} currencies={d.currencies} initial={{ id, clientId: q.clientId, projectId: q.projectId ?? undefined, currency: q.currency, items: q.items, discount: q.discount, taxRateBps: q.taxRateBps, depositPercent: q.depositPercent, validUntil: q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : undefined, notes: q.notes ?? "", terms: q.terms ?? "", title: q.title ?? "" }} defaults={{ taxRateBps: d.quote.taxRateBps, depositPercent: d.quote.defaultDepositPercent, validDays: d.quote.validDays, terms: d.quote.terms, dueDays: d.invoice.dueDays }} />
      </>
    );
  }
  return (
    <>
      <div className="mb-2"><Link href="/admin/quotes" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Quotes</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{q.number}<QuoteBadge value={q.status} /></span>}
        description={<>{q.client.companyName}{q.project ? <> · <Link className="font-semibold text-fg hover:underline" href={`/admin/projects/${q.project.id}`}>{q.project.code} {q.project.name}</Link></> : null}</>}
        actions={<>
          {editable ? <ButtonLink href={`/admin/quotes/${id}?edit=1`} icon="pencil" variant="outline">Edit</ButtonLink> : null}
          {canWrite && ["DRAFT", "SENT", "VIEWED"].includes(q.status) ? <ActionButton url={`/api/quotes/${id}/send`} icon="send" variant="dark" success={q.status === "DRAFT" ? "Quote sent to the client" : "Quote re-sent"}>{q.status === "DRAFT" ? "Send to client" : "Resend"}</ActionButton> : null}
        </>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-6 sm:p-8">
          <DocLines items={q.items} currency={q.currency} subtotal={q.subtotal} discount={q.discount} tax={q.tax} taxRateBps={q.taxRateBps} total={q.total} deposit={q.deposit} balance={q.balance} depositPercent={q.depositPercent} />
          {q.notes ? <p className="mt-6 whitespace-pre-wrap text-sm">{q.notes}</p> : null}
          {q.terms ? <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{q.terms}</p> : null}
        </Card>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="Timeline" />
            <ul className="space-y-2.5 px-5 pb-5 text-sm">
              <li className="flex justify-between"><span className="text-muted">Created</span><span>{formatDateTime(q.createdAt)}</span></li>
              {q.sentAt ? <li className="flex justify-between"><span className="text-muted">Sent</span><span>{formatDateTime(q.sentAt)}</span></li> : null}
              {q.viewedAt ? <li className="flex justify-between"><span className="text-muted">Viewed</span><span>{formatDateTime(q.viewedAt)}</span></li> : null}
              {q.acceptedAt ? <li className="flex justify-between font-semibold text-success"><span>Accepted</span><span>{formatDateTime(q.acceptedAt)}</span></li> : null}
              {q.rejectedAt ? <li className="text-danger"><div className="flex justify-between font-semibold"><span>Declined</span><span>{formatDateTime(q.rejectedAt)}</span></div>{q.rejectionReason ? <p className="mt-1 text-muted">{q.rejectionReason}</p> : null}</li> : null}
              {q.validUntil ? <li className="flex justify-between"><span className="text-muted">Valid until</span><span>{formatDate(q.validUntil)}</span></li> : null}
              <li className="flex justify-between"><span className="text-muted">Created by</span><span>{q.createdBy?.name ?? "—"}</span></li>
            </ul>
          </Card>
          {q.contracts.length || q.invoices.length ? (
            <Card>
              <CardHeader title="Linked documents" />
              <ul className="divide-y divide-line">
                {q.contracts.map((c) => <li key={c.id}><Link href={`/admin/contracts/${c.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/60"><b>{c.number}</b><ContractBadge value={c.status} /></Link></li>)}
                {q.invoices.map((i) => <li key={i.id}><Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/60"><span><b>{i.number}</b> <span className="text-xs text-muted">{formatMoney(i.total, q.currency)}</span></span><InvoiceBadge value={i.status} /></Link></li>)}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
