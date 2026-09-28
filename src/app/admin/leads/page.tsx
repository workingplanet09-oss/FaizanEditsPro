import { requirePageActor, can } from "@/server/auth/actor";
import { leadCounts, listLeads } from "@/server/services/leads";
import { listAssignable } from "@/server/services/projects";
import { guard, first, num, type SearchParams } from "@/server/page";
import { db } from "@/server/db";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { TabNav } from "@/components/ui/tabs";
import { LeadStatusBadge, TemperatureBadge } from "@/components/portal/common";
import { budgetLabel } from "@/lib/lead-labels";
import { formatDateShort, relativeDeadline, timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Leads & CRM", path: "/admin/leads", noindex: true });

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/leads");
  const sp = await searchParams;
  const section = (first(sp.section) ?? "leads") as "leads" | "prospects" | "lost" | "converted" | "all";
  const filters = { q: first(sp.q), temperature: first(sp.temperature), source: first(sp.source), assignedTo: first(sp.assignedTo), status: first(sp.status), sort: first(sp.sort) };
  const [res, counts, sources, staff] = await guard(() => Promise.all([listLeads(actor, { section, page: num(sp.page), ...filters }), leadCounts(actor), db.leadSource.findMany({ orderBy: { label: "asc" } }), can(actor, "projects:assign") ? listAssignable(actor) : Promise.resolve([])]));
  const params = { ...filters, section: section === "leads" ? undefined : section };
  return (
    <>
      <PageHeader title="Leads & CRM" description="Every inquiry, scored automatically and ready to follow up. Scores and temperatures are internal — visitors never see them." />
      <TabNav basePath="/admin/leads" param="section" active={section} tabs={[{ key: "leads", label: "New leads", count: counts.leads }, { key: "prospects", label: "Prospects", count: counts.prospects }, { key: "converted", label: "Converted", count: counts.converted }, { key: "lost", label: "Lost & archived", count: counts.lost }, { key: "all", label: "All" }]} extra={Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v]))} />
      <Card>
        <FilterBar
          action="/admin/leads"
          values={{ ...filters, section: section === "leads" ? undefined : section }}
          fields={[
            { name: "q", label: "Search leads", placeholder: "Search name, company, email, request ID…" },
            { name: "temperature", label: "Temperature", type: "select", options: [["HOT", "Hot"], ["WARM", "Warm"], ["COLD", "Cold"], ["NEEDS_REVIEW", "Needs review"]].map(([value, label]) => ({ value, label })) },
            { name: "source", label: "Source", type: "select", options: sources.map((s) => ({ value: s.key, label: s.label })) },
            { name: "assignedTo", label: "Owner", type: "select", options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.name }))] },
            { name: "sort", label: "Sort", type: "select", options: [{ value: "score", label: "Highest score" }, { value: "followup", label: "Follow-up due" }, { value: "oldest", label: "Oldest first" }] },
          ]}
        >
          <input type="hidden" name="section" value={section} />
        </FilterBar>
        <DataTable
          rows={res.items}
          rowKey={(l) => l.id}
          rowHref={(l) => `/admin/leads/${l.id}`}
          empty={<EmptyState icon="inbox" title={Object.values(filters).some(Boolean) ? "No leads match these filters" : "No leads here yet"} description={Object.values(filters).some(Boolean) ? "Try clearing a filter." : "New inquiries from the Start a Project form land here automatically."} />}
          columns={[
            { key: "n", header: "Lead", primary: true, render: (l) => <span><span className="font-bold">{l.name}</span><span className="block text-xs font-normal text-muted">{l.company || l.email}</span></span> },
            { key: "t", header: "Temp", render: (l) => <TemperatureBadge value={l.temperature} overridden={l.overridden} /> },
            { key: "s", header: "Status", render: (l) => <LeadStatusBadge value={l.status} /> },
            { key: "w", header: "Looking for", hideOnMobile: true, render: (l) => <span className="capitalize">{(l.lookingFor ?? "—").replace(/_/g, " ")}</span> },
            { key: "b", header: "Budget", hideOnMobile: true, render: (l) => budgetLabel(l.budgetRange) },
            { key: "src", header: "Source", hideOnMobile: true, render: (l) => l.source ?? "—" },
            { key: "o", header: "Owner", hideOnMobile: true, render: (l) => l.assignedTo?.name ?? <span className="text-subtle">Unassigned</span> },
            { key: "f", header: "Follow-up", hideOnMobile: true, render: (l) => (l.nextFollowUpAt ? <span className={new Date(l.nextFollowUpAt) < new Date() ? "font-semibold text-danger" : ""}>{relativeDeadline(l.nextFollowUpAt)}</span> : "—") },
            { key: "c", header: "Received", align: "right", render: (l) => <span title={formatDateShort(l.createdAt)} className="text-muted">{timeAgo(l.createdAt)}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/leads" params={params as Record<string, string | undefined>} />
      </Card>
    </>
  );
}
