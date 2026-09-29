import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { analyticsReport, profitability, teamWorkload } from "@/server/services/analytics";
import { guard, first, type SearchParams } from "@/server/page";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/table";
import { BarChart, ChartCard, Donut, HBar, LineChart } from "@/components/charts/charts";
import { MoneyMap } from "@/components/portal/money-map";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Analytics", path: "/admin/analytics", noindex: true });

const RANGES: Record<string, { label: string; months: number }> = { "3m": { label: "3 months", months: 3 }, "6m": { label: "6 months", months: 6 }, "12m": { label: "12 months", months: 12 } };

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/analytics");
  if (!can(actor, "analytics:read")) denyPage();
  const sp = await searchParams;
  const key = RANGES[first(sp.range) ?? ""] ? first(sp.range)! : "12m";
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (RANGES[key].months - 1), 1));
  const [r, workload, profit] = await guard(() => Promise.all([analyticsReport(actor, { from, to: new Date(Date.now() + 86400000) }), teamWorkload(actor), can(actor, "profitability:read") ? profitability(actor) : Promise.resolve(null)]));
  const cur = r.defaultCurrency;
  const m = (n: number) => formatMoney(n, cur, { compact: true });
  return (
    <>
      <PageHeader title="Analytics" description="Real numbers from your database — nothing is estimated or invented. Empty charts mean there's no data yet." actions={<ButtonLink href="/admin/exports" icon="download" variant="outline">Exports</ButtonLink>} />
      <TabNav basePath="/admin/analytics" param="range" active={key} tabs={Object.entries(RANGES).map(([k, v]) => ({ key: k, label: `Last ${v.label}` })).reverse()} />
      {!r.hasData ? (
        <Card><EmptyState icon="chart" title="No data available yet" description="As leads arrive, projects are delivered and invoices are paid, your charts fill in automatically." /></Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue collected" value={<MoneyMap value={r.revenueTotals} compact />} icon="trending" tone="success" />
            <Stat label="Outstanding invoices" value={formatMoney(r.outstanding, cur, { compact: true })} icon="wallet" tone={r.outstanding ? "warning" : undefined} />
            <Stat label="Average payment" value={<MoneyMap value={r.averageOrderValue} compact />} icon="receipt" />
            <Stat label="Lead → client rate" value={r.leadConversion.rate === null ? "—" : `${r.leadConversion.rate}%`} sub={`${r.leadConversion.converted} of ${r.leadConversion.total} leads`} icon="target" />
            <Stat label="Projects completed" value={r.projectsCompleted} sub={`${r.projectsCreated} created`} icon="film" />
            <Stat label="Avg. turnaround" value={r.averageTurnaroundDays === null ? "—" : `${r.averageTurnaroundDays} days`} sub="start → delivery" icon="timer" />
            <Stat label="Active / repeat clients" value={`${r.activeClients} / ${r.repeatClients}`} sub={`${r.retainerClients} on retainer`} icon="users" />
            <Stat label="Revision requests" value={r.revisionCount} sub={r.overdueProjects ? `${r.overdueProjects} projects overdue` : "none overdue"} icon="refresh" tone={r.overdueProjects ? "danger" : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Revenue by month" subtitle={`Payments received in ${cur}`}><BarChart data={r.revenueByMonth.map((x) => ({ label: x.month, value: x.value }))} format={m} label="Revenue by month" /></ChartCard>
            <ChartCard title="New leads by month"><LineChart data={r.leadsByMonth.map((x) => ({ label: x.month, value: x.value }))} label="New leads by month" /></ChartCard>
            <ChartCard title="Client growth" subtitle="New clients per month"><LineChart data={r.clientGrowth.map((x) => ({ label: x.month, value: x.value }))} label="New clients by month" color="var(--info)" /></ChartCard>
            <ChartCard title="Revenue by service" subtitle={`In ${cur}`}><HBar data={r.revenueByService} format={m} label="Revenue by service" /></ChartCard>
            <ChartCard title="Where leads come from"><HBar data={r.leadSources} label="Lead sources" /></ChartCard>
            <ChartCard title="Project types"><Donut data={r.projectTypes} label="Projects by type" center={<><span className="text-2xl font-extrabold">{r.projectsCreated}</span><span className="text-[11px] text-subtle">projects</span></>} /></ChartCard>
            <ChartCard title="Projects by status" className="lg:col-span-2"><Donut data={r.statusDistribution.map((s) => ({ label: s.label, value: s.value }))} label="Projects by status" /></ChartCard>
          </div>
        </>
      )}

      <Card className="mt-6">
        <CardHeader title="Team workload" description="Open projects, tasks and tracked hours (last 30 days)." />
        <DataTable
          rows={workload}
          rowKey={(w) => w.id}
          empty={<p className="px-5 pb-6 text-sm text-muted">No editors or project managers yet.</p>}
          columns={[
            { key: "n", header: "Person", primary: true, render: (w) => <span className="font-bold">{w.name}<span className="block text-xs font-normal text-muted">{w.role}</span></span> },
            { key: "p", header: "Open projects", align: "right", render: (w) => w.projects },
            { key: "t", header: "Open tasks", align: "right", render: (w) => w.openTasks },
            { key: "h", header: "Hours (30d)", align: "right", render: (w) => w.hours30d },
          ]}
        />
      </Card>
      {profit ? (
        <Card className="mt-6">
          <CardHeader title="Project profitability" description="Revenue collected minus internal cost and tracked labour. Visible to admins only." />
          <DataTable
            rows={profit}
            rowKey={(p) => p.id}
            empty={<p className="px-5 pb-6 text-sm text-muted">No projects with revenue yet.</p>}
            columns={[
              { key: "n", header: "Project", primary: true, render: (p) => <span className="font-bold">{p.name}<span className="block text-xs font-normal text-muted">{p.code} · {p.client}</span></span> },
              { key: "r", header: "Revenue", align: "right", render: (p) => formatMoney(p.revenue, p.currency) },
              { key: "c", header: "Cost", align: "right", render: (p) => formatMoney(p.cost, p.currency) },
              { key: "h", header: "Hours", hideOnMobile: true, align: "right", render: (p) => p.hours },
              { key: "m", header: "Margin", align: "right", render: (p) => <span className={p.margin < 0 ? "font-bold text-danger" : "font-semibold"}>{formatMoney(p.margin, p.currency)}{p.marginPct !== null ? ` (${p.marginPct}%)` : ""}</span> },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}
