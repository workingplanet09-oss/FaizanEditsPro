import Link from "next/link";
import { requirePageActor, denyPage, can } from "@/server/auth/actor";
import { listEmails, jobStats } from "@/server/services/admin";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { ActionButton } from "@/components/ui/action-button";
import { formatDateTime } from "@/lib/format";
import { integrationStatus } from "@/server/env";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Email outbox", path: "/admin/emails", noindex: true });

export default async function EmailsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/emails");
  if (!can(actor, "automations:manage")) denyPage();
  const sp = await searchParams;
  const f = { q: first(sp.q), status: first(sp.status) };
  const [res, jobs] = await guard(() => Promise.all([listEmails(actor, { ...f, page: num(sp.page) }), can(actor, "settings:manage") ? jobStats(actor) : Promise.resolve(null)]));
  const email = integrationStatus().email;
  return (
    <>
      <PageHeader title="Email outbox" description="Every email the platform generated — sent, queued or failed. Templates are edited under Website content → Email templates." actions={<Link href="/admin/content?r=email-templates" className="inline-flex h-11 items-center rounded-xl border border-line-strong px-5 text-sm font-semibold hover:bg-surface-2">Edit templates</Link>} />
      {email.provider === "console" ? <p role="status" className="mb-5 rounded-2xl border border-info/30 bg-info-soft px-5 py-3.5 text-sm text-info"><b>Demo mode:</b> emails are written to this outbox instead of being delivered. Set <code>EMAIL_PROVIDER</code> and an API key to send real email.</p> : null}
      {jobs ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
          {Object.entries(jobs.counts).map(([k, n]) => <Badge key={k} tone={k === "FAILED" ? "danger" : k === "PENDING" ? "warning" : "neutral"}>{k.toLowerCase()}: {n as number}</Badge>)}
          {jobs.counts.FAILED ? <ActionButton url="/api/admin/jobs" size="sm" variant="outline" success="Failed jobs queued for retry">Retry failed jobs</ActionButton> : null}
        </div>
      ) : null}
      <Card>
        <FilterBar action="/admin/emails" values={f} fields={[{ name: "q", label: "Search emails", placeholder: "Search recipient or subject…" }, { name: "status", label: "Status", type: "select", options: ["QUEUED", "SENT", "FAILED", "SKIPPED"].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() })) }]} />
        <DataTable
          rows={res.items}
          rowKey={(e) => e.id}
          empty={<EmptyState icon="mail" title="No emails yet" description="Emails appear here as the platform sends them." />}
          columns={[
            { key: "s", header: "Subject", primary: true, render: (e) => <span><span className="font-bold">{e.subject}</span><span className="block text-xs font-normal text-muted">To {e.toEmail}{e.templateKey ? ` · ${e.templateKey}` : ""}</span></span> },
            { key: "st", header: "Status", render: (e) => <Badge tone={e.status === "SENT" ? "success" : e.status === "FAILED" ? "danger" : "neutral"}>{e.status.toLowerCase()}</Badge> },
            { key: "w", header: "When", align: "right", render: (e) => <span className="text-muted">{formatDateTime(e.createdAt)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/emails" params={f} />
      </Card>
    </>
  );
}
