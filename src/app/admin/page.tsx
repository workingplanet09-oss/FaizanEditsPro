import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { adminHome, analyticsReport } from "@/server/services/analytics";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ActivityFeed, InvoiceBadge } from "@/components/portal/common";
import { MoneyMap } from "@/components/portal/money-map";
import { BarChart, ChartCard } from "@/components/charts/charts";
import { greeting, formatDateShort, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Command center", path: "/admin", noindex: true });

export default async function AdminHome() {
  const actor = await requirePageActor("admin", "/admin");
  const h = await adminHome(actor);
  const report = can(actor, "analytics:read") ? await analyticsReport(actor).catch(() => null) : null;
  const first = actor.name.split(" ")[0];
  const revenue = report?.revenueByMonth.slice(-6).map((m) => ({ label: m.month, value: m.value })) ?? [];
  const total = h.pipeline.reduce((s, p) => s + p.count, 0);
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${first}`}
        description="Everything that needs you today, in one place."
        actions={
          <>
            {can(actor, "projects:write") ? <ButtonLink href="/admin/projects/new" icon="plus" variant="dark">New project</ButtonLink> : null}
            {can(actor, "quotes:write") ? <ButtonLink href="/admin/quotes/new" icon="clipboard" variant="outline">New quote</ButtonLink> : null}
            {can(actor, "invoices:write") ? <ButtonLink href="/admin/invoices/new" icon="receipt" variant="outline">New invoice</ButtonLink> : null}
          </>
        }
      />

      {h.alerts.length ? (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label="Alerts">
          {h.alerts.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className={cn("inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:-translate-y-px hover:shadow-soft", a.tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : a.tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-info/30 bg-info-soft text-info")}>
                <Icon name={a.tone === "info" ? "info" : "alert"} size={15} />{a.text}<Icon name="chevron-right" size={13} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm font-semibold text-success"><Icon name="check-circle" size={16} /> Nothing urgent right now.</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {h.perms.leads ? <Stat label="New leads (14 days)" value={h.metrics.newLeads} icon="inbox" href="/admin/leads?section=leads" /> : null}
        <Stat label="Active clients" value={h.metrics.activeClients} icon="building" href="/admin/clients" />
        {h.perms.projects ? <Stat label="Active projects" value={h.metrics.activeProjects} icon="film" href="/admin/projects" /> : null}
        {h.perms.projects ? <Stat label="Due within 3 days" value={h.metrics.dueSoon} icon="clock" tone={h.metrics.dueSoon ? "warning" : undefined} href="/admin/projects?deadline=week" /> : null}
        {h.perms.projects ? <Stat label="Waiting on client review" value={h.metrics.pendingReviews} icon="eye" href="/admin/projects?status=CLIENT_REVIEW,FINAL_REVIEW" /> : null}
        {h.perms.invoices ? <Stat label="Pending payments" value={<MoneyMap value={h.metrics.pendingPayments} compact />} icon="wallet" tone={Object.keys(h.metrics.pendingPayments).length ? "warning" : undefined} href="/admin/invoices" /> : null}
        {h.perms.invoices ? <Stat label="Revenue this month" value={<MoneyMap value={h.metrics.monthlyRevenue} compact />} icon="trending" tone="success" href="/admin/payments" /> : null}
        {h.perms.invoices ? <Stat label="Retainer revenue / mo" value={<MoneyMap value={h.metrics.retainerRevenue} compact />} icon="repeat" href="/admin/retainers" /> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {h.perms.projects ? (
            <Card>
              <CardHeader title="Project pipeline" description={`${total} project${total === 1 ? "" : "s"} across all stages`} action={<Link href="/admin/projects?view=board" className="text-sm font-semibold text-accent hover:underline">Open board</Link>} />
              <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
                {h.pipeline.map((p) => (
                  <Link key={p.key} href={`/admin/projects?stage=${p.key}`} className="group rounded-xl border border-line p-3.5 transition hover:border-line-strong hover:bg-surface-2/50">
                    <div className="text-2xl font-extrabold tabular-nums">{p.count}</div>
                    <div className="mt-0.5 text-xs font-semibold text-muted group-hover:text-fg">{p.label}</div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${total ? (p.count / total) * 100 : 0}%` }} /></div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            {h.perms.projects ? (
              <Card>
                <CardHeader title="Upcoming deadlines" action={<Link href="/admin/calendar" className="text-sm font-semibold text-accent hover:underline">Calendar</Link>} />
                {h.deadlines.length ? (
                  <ul className="divide-y divide-line">
                    {h.deadlines.map((d) => (
                      <li key={d.id}>
                        <Link href={`/admin/projects/${d.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/60">
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{d.name}</div><div className="truncate text-xs text-muted">{d.client.companyName} · {d.code}</div></div>
                          <div className="text-right"><div className={cn("text-xs font-bold", d.deadline && d.deadline < new Date() ? "text-danger" : "")}>{d.label}</div><div className="text-[11px] text-subtle">{d.deadline ? formatDateShort(d.deadline) : ""}</div></div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState icon="calendar" title="No deadlines" description="Open projects with deadlines will show up here." />}
              </Card>
            ) : null}
            {h.perms.invoices ? (
              <Card>
                <CardHeader title="Outstanding invoices" action={<Link href="/admin/invoices" className="text-sm font-semibold text-accent hover:underline">All invoices</Link>} />
                {h.unpaid.length ? (
                  <ul className="divide-y divide-line">
                    {h.unpaid.map((i) => (
                      <li key={i.id}>
                        <Link href={`/admin/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/60">
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{i.number} · {i.client.companyName}</div><div className="text-xs text-muted">{i.dueDate ? `Due ${formatDateShort(i.dueDate)}` : "No due date"}</div></div>
                          <div className="text-right"><div className="text-sm font-bold tabular-nums">{formatMoney(i.total - i.amountPaid, i.currency)}</div><InvoiceBadge value={i.status} /></div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState icon="receipt" title="Nothing outstanding" description="Every invoice sent so far has been paid." />}
              </Card>
            ) : null}
          </div>

          {report ? (
            <ChartCard title="Revenue — last 6 months" subtitle={`Received payments in ${report.defaultCurrency}`}>
              <BarChart data={revenue} label="Revenue by month" format={(n) => formatMoney(n, report.defaultCurrency, { compact: true })} height={180} />
            </ChartCard>
          ) : null}
        </div>

        <aside className="space-y-6">
          {actor.permissions.has("messages:read") ? (
            <Card>
              <CardHeader title="Unread messages" action={<Link href="/admin/messages" className="text-sm font-semibold text-accent hover:underline">Inbox</Link>} />
              {h.unreadMessages.length ? (
                <ul className="divide-y divide-line">
                  {h.unreadMessages.map((m) => (
                    <li key={m.id}><Link href={m.projectId ? `/admin/messages?thread=${m.projectId}` : "/admin/messages"} className="block px-5 py-3 transition hover:bg-surface-2/60"><div className="flex justify-between gap-2 text-xs"><b>{m.from}{m.projectName ? <span className="font-normal text-subtle"> · {m.projectName}</span> : null}</b><span className="shrink-0 text-subtle">{timeAgo(m.at)}</span></div><p className="mt-0.5 line-clamp-2 text-sm text-muted">{m.body}</p></Link></li>
                  ))}
                </ul>
              ) : <p className="px-5 pb-5 text-sm text-muted">Inbox zero. Nice.</p>}
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Recent activity" />
            <ActivityFeed items={h.recent.map((r) => ({ ...r, project: r.project ? { id: r.project.id, name: r.project.name } : null }))} showProject={false} empty="Activity appears here as work happens." />
          </Card>
        </aside>
      </div>
    </>
  );
}
