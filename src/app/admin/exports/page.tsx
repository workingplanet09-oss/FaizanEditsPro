import { requirePageActor, can } from "@/server/auth/actor";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Exports", path: "/admin/exports", noindex: true });

const EXPORTS: { key: string; label: string; description: string; icon: string; perm: string }[] = [
  { key: "leads", label: "Leads", description: "Every inquiry with score, temperature, source and UTM data.", icon: "inbox", perm: "leads:read" },
  { key: "clients", label: "Clients", description: "Company, contact, status, project counts.", icon: "building", perm: "clients:read" },
  { key: "projects", label: "Projects", description: "Status, deadline, team, payment state.", icon: "film", perm: "projects:read_all" },
  { key: "invoices", label: "Invoices", description: "Numbers, amounts, status, due dates.", icon: "receipt", perm: "invoices:read" },
  { key: "payments", label: "Payments", description: "Every payment with method and transaction reference.", icon: "wallet", perm: "payments:read" },
  { key: "testimonials", label: "Testimonials", description: "Ratings, quotes and publishing permission.", icon: "quote", perm: "cms:manage" },
  { key: "report-monthly-revenue", label: "Report — monthly revenue", description: "Collected revenue per month and currency.", icon: "chart", perm: "analytics:read" },
  { key: "report-client-acquisition", label: "Report — client acquisition", description: "New leads and clients by month and source.", icon: "trending", perm: "analytics:read" },
  { key: "report-project-performance", label: "Report — project performance", description: "Turnaround and revisions per project.", icon: "timer", perm: "analytics:read" },
  { key: "report-editing-services", label: "Report — editing services", description: "Projects and revenue by service.", icon: "layers", perm: "analytics:read" },
  { key: "report-outstanding-invoices", label: "Report — outstanding invoices", description: "Everything unpaid, with ageing.", icon: "alert", perm: "analytics:read" },
  { key: "report-team-workload", label: "Report — team workload", description: "Open projects, tasks and hours per person.", icon: "users", perm: "analytics:read" },
];

export default async function ExportsPage() {
  const actor = await requirePageActor("admin", "/admin/exports");
  const list = EXPORTS.filter((e) => can(actor, e.perm));
  return (
    <>
      <PageHeader title="Exports" description="Download your data as CSV. Files open cleanly in Excel and Google Sheets; formula-like cells are neutralised for safety." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((e) => (
          <Card key={e.key} className="flex flex-col p-5">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={e.icon} size={18} /></span><div><h3 className="font-extrabold">{e.label}</h3><p className="mt-0.5 text-sm text-muted">{e.description}</p></div></div>
            <div className="mt-auto flex gap-2 pt-4">
              <a href={`/api/admin/exports/${e.key}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-fg px-3.5 text-sm font-semibold text-bg hover:opacity-90"><Icon name="download" size={14} />CSV for Excel</a>
              <a href={`/api/admin/exports/${e.key}?excel=0`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-2">Plain CSV</a>
            </div>
          </Card>
        ))}
      </div>
      {!list.length ? <Card><CardHeader title="Nothing to export" description="Your role doesn't include any export permissions." /></Card> : null}
    </>
  );
}
