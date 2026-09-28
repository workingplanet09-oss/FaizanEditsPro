import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getLead } from "@/server/services/leads";
import { listNotes } from "@/server/services/notes";
import { listAssignable } from "@/server/services/projects";
import { Card, CardHeader, PageHeader, Meta } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { LeadStatusBadge, QuoteBadge, StatusBadge, TemperatureBadge } from "@/components/portal/common";
import { LeadActivityForm, LeadControls, LeadDecisions } from "@/components/admin/lead-actions";
import { NotesPanel } from "@/components/admin/notes-panel";
import { HBar } from "@/components/charts/charts";
import { budgetLabel } from "@/lib/lead-labels";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Lead", robots: { index: false, follow: false } };

const ICON: Record<string, string> = { inquiry_submitted: "inbox", status_changed: "refresh", note: "pencil", contacted: "phone", email_sent: "mail", call_made: "phone", call_scheduled: "calendar", meeting: "users", quote_sent: "clipboard", quote_viewed: "eye", quote_accepted: "check-circle", contract_sent: "sign", contract_signed: "sign", payment_received: "wallet", project_started: "rocket", project_created: "film", converted: "check-circle" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("admin", `/admin/leads/${id}`);
  const lead = await guard(() => getLead(actor, id));
  const [notes, staff] = await Promise.all([can(actor, "notes:read") ? listNotes(actor, "LEAD", id) : [], can(actor, "projects:assign") ? listAssignable(actor) : []]);
  const sections = [...new Set(lead.answers.map((a) => a.section))];
  const breakdown = Object.entries((lead.scoreBreakdown ?? {}) as Record<string, number>).map(([label, value]) => ({ label: label.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), value }));
  return (
    <>
      <div className="mb-2"><Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Leads</Link></div>
      <PageHeader
        eyebrow={lead.requestCode}
        title={<span className="flex flex-wrap items-center gap-3">{lead.name}<TemperatureBadge value={lead.temperature} overridden={lead.overridden} /><LeadStatusBadge value={lead.status} /></span>}
        description={[lead.company, lead.email, lead.phone].filter(Boolean).join(" · ")}
        actions={<>
          {can(actor, "quotes:write") && lead.client ? <ButtonLink href={`/admin/quotes/new?clientId=${lead.client.id}&leadId=${lead.id}${lead.project ? `&projectId=${lead.project.id}` : ""}`} icon="clipboard" variant="outline">Create quote</ButtonLink> : null}
          <a href={`mailto:${lead.email}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm font-semibold hover:bg-surface-2"><Icon name="mail" size={16} /> Email</a>
        </>}
      />
      <div className="mb-6"><LeadDecisions leadId={lead.id} status={lead.status} canConvert={can(actor, "leads:convert") && can(actor, "clients:write")} canWrite={can(actor, "leads:write")} hasClient={!!lead.client} /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {lead.client || lead.project ? (
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
              {lead.client ? <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Client</div><Link href={`/admin/clients/${lead.client.id}`} className="font-bold hover:underline">{lead.client.companyName}</Link></div> : null}
              {lead.project ? <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Project</div><Link href={`/admin/projects/${lead.project.id}`} className="font-bold hover:underline">{lead.project.code} · {lead.project.name}</Link> <StatusBadge status={lead.project.status as any} /></div> : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="What they told us" description={`Submitted ${formatDateTime(lead.createdAt)}`} />
            <div className="space-y-6 px-5 pb-6">
              {lead.description ? <p className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-4 text-sm leading-relaxed">{lead.description}</p> : null}
              {sections.map((sec) => (
                <div key={sec}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">{sec.replace(/_/g, " ")}</h3>
                  <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {lead.answers.filter((a) => a.section === sec).map((a) => <Meta key={a.key} label={a.question}>{a.answer}</Meta>)}
                  </dl>
                </div>
              ))}
              {!lead.answers.length ? <p className="text-sm text-muted">No form answers were stored for this lead.</p> : null}
              {lead.attachments.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Reference files</h3>
                  <ul className="divide-y divide-line rounded-xl border border-line">{lead.attachments.map((a) => <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><Icon name="file" size={16} className="text-muted" /><span className="flex-1 truncate font-medium">{a.displayName}</span><span className="text-xs text-subtle">{formatBytes(a.sizeBytes)}</span><a className="text-xs font-bold text-accent hover:underline" href={`/api/assets/${a.id}?download=1`} target="_blank" rel="noreferrer">Open</a></li>)}</ul>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity timeline" />
            <ol className="relative px-5 pb-5">
              <span aria-hidden className="absolute bottom-6 left-[31px] top-2 w-px bg-line" />
              {lead.activities.map((a) => (
                <li key={a.id} className="relative flex gap-3 py-2.5">
                  <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"><Icon name={ICON[a.type] ?? "activity"} size={13} /></span>
                  <div className="min-w-0"><p className="text-sm font-semibold">{a.title}</p>{(a.metadata as any)?.note ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{(a.metadata as any).note}</p> : null}<p className="mt-0.5 text-xs text-subtle">{timeAgo(a.createdAt)} · {a.actor?.name ?? "System"}</p></div>
                </li>
              ))}
            </ol>
          </Card>
          {can(actor, "leads:write") ? <LeadActivityForm leadId={lead.id} /> : null}
        </div>

        <aside className="space-y-6">
          <LeadControls lead={{ id: lead.id, status: lead.status, assignedToId: lead.assignedToId, nextFollowUpAt: lead.nextFollowUpAt, temperature: lead.temperature, overridden: lead.overridden, computedTemperature: lead.computedTemperature, lostReason: lead.lostReason }} staff={staff} canWrite={can(actor, "leads:write")} />
          <Card>
            <CardHeader title="Score" description="Internal only" action={<span className="text-2xl font-extrabold tabular-nums">{lead.score}<span className="text-sm font-semibold text-subtle">/100</span></span>} />
            <div className="px-5 pb-5"><HBar data={breakdown} label="Score breakdown" max={30} /></div>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
              <Meta label="Looking for"><span className="capitalize">{(lead.lookingFor ?? "").replace(/_/g, " ")}</span></Meta>
              <Meta label="Budget">{budgetLabel(lead.budgetRange)}</Meta>
              <Meta label="Client type"><span className="capitalize">{lead.clientType}</span></Meta>
              <Meta label="Industry">{lead.industry}</Meta>
              <Meta label="Source">{lead.source?.label}</Meta>
              <Meta label="Service page">{lead.serviceSlug}</Meta>
              <Meta label="Website" className="col-span-2">{lead.website ? <a className="text-accent hover:underline" href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : null}</Meta>
              {lead.utmSource || lead.utmCampaign ? <Meta label="UTM" className="col-span-2">{[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}</Meta> : null}
              {lead.referrer ? <Meta label="Referrer" className="col-span-2"><span className="break-all">{lead.referrer}</span></Meta> : null}
              {lead.referralCode ? <Meta label="Referral code">{lead.referralCode}</Meta> : null}
              {lead.lostReason ? <Meta label="Lost reason" className="col-span-2">{lead.lostReason}</Meta> : null}
            </dl>
          </Card>
          {lead.quotes.length ? (
            <Card>
              <CardHeader title="Quotes" />
              <ul className="divide-y divide-line">{lead.quotes.map((q) => <li key={q.id}><Link href={`/admin/quotes/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2/60"><span className="font-bold">{q.number}</span><span className="tabular-nums">{formatMoney(q.total, q.currency)}</span><QuoteBadge value={q.status} /></Link></li>)}</ul>
            </Card>
          ) : null}
          {can(actor, "notes:read") ? <NotesPanel entityType="LEAD" entityId={lead.id} notes={notes as any} canWrite={can(actor, "notes:write")} /> : null}
        </aside>
      </div>
    </>
  );
}
