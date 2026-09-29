import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getQuote } from "@/server/services/quotes";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { QuoteBadge } from "@/components/portal/common";
import { DocLines } from "@/components/portal/doc-lines";
import { QuoteActions } from "@/components/portal/quote-actions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Quote", robots: { index: false, follow: false } };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("client", `/dashboard/quotes/${id}`);
  const q = await guard(() => getQuote(actor, id, { markViewed: true }));
  const open = ["SENT", "VIEWED"].includes(q.status);
  const expired = q.validUntil && q.validUntil < new Date();
  const contract = q.contracts.find((c) => c.status !== "DRAFT");
  return (
    <>
      <div className="mb-2"><Link href="/dashboard/quotes" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Quotes</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{q.number} <QuoteBadge value={q.status} /></span>}
        description={q.project ? <>For <Link className="font-semibold text-fg hover:underline" href={`/dashboard/projects/${q.project.id}`}>{q.project.name}</Link></> : q.title}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap justify-between gap-4 border-b border-line pb-6 text-sm">
            <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Prepared for</div><div className="mt-1 font-bold">{q.client.companyName}</div><div className="text-muted">{q.client.name}</div></div>
            <div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-subtle">Valid until</div><div className={`mt-1 font-bold ${expired ? "text-danger" : ""}`}>{q.validUntil ? formatDate(q.validUntil) : "—"}</div>{q.sentAt ? <div className="text-muted">Sent {formatDate(q.sentAt)}</div> : null}</div>
          </div>
          <DocLines items={q.items} currency={q.currency} subtotal={q.subtotal} discount={q.discount} tax={q.tax} taxRateBps={q.taxRateBps} total={q.total} deposit={q.deposit} balance={q.balance} depositPercent={q.depositPercent} />
          {q.notes ? <div className="mt-8"><h3 className="text-xs font-bold uppercase tracking-wider text-subtle">Notes</h3><p className="mt-1.5 whitespace-pre-wrap text-sm">{q.notes}</p></div> : null}
          {q.terms ? <div className="mt-6"><h3 className="text-xs font-bold uppercase tracking-wider text-subtle">Terms</h3><p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{q.terms}</p></div> : null}
        </Card>
        <aside className="space-y-4">
          {open && !expired ? (
            <Card className="p-5"><h2 className="text-base font-extrabold">Ready to go ahead?</h2><p className="mb-4 mt-1 text-sm text-muted">Accepting takes you straight to the agreement — nothing is charged until you sign it.</p><QuoteActions id={q.id} projectId={q.project?.id ?? null} /></Card>
          ) : q.status === "ACCEPTED" ? (
            <Card className="border-success/30 bg-success-soft/40 p-5"><div className="flex items-center gap-2 font-extrabold"><Icon name="check-circle" className="text-success" /> Accepted</div><p className="mt-1 text-sm text-muted">{q.acceptedAt ? `You accepted this quote on ${formatDate(q.acceptedAt)}.` : ""}</p>{contract ? <ButtonLink href={`/dashboard/contracts/${contract.id}`} className="mt-3" icon="sign">{contract.status === "SIGNED" ? "View contract" : "Review contract"}</ButtonLink> : null}</Card>
          ) : (
            <Card className="p-5 text-sm text-muted">{expired || q.status === "EXPIRED" ? "This quote has expired. Message us and we'll refresh it." : q.status === "REJECTED" ? "You declined this quote." : "This quote is not open for action."}<ButtonLink href="/dashboard/messages" variant="outline" className="mt-3" icon="message">Message us</ButtonLink></Card>
          )}
          <Card className="p-5 text-sm"><h3 className="font-extrabold">Questions?</h3><p className="mt-1 text-muted">Ask your project manager anything about scope, timing or price.</p><Link href={q.project ? `/dashboard/projects/${q.project.id}?tab=messages` : "/dashboard/messages"} className="mt-2 inline-block font-semibold text-accent-text hover:underline">Send a message →</Link></Card>
        </aside>
      </div>
    </>
  );
}
