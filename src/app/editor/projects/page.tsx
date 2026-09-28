import { requirePageActor } from "@/server/auth/actor";
import { listProjectsStaff } from "@/server/services/projects";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { TabNav } from "@/components/ui/tabs";
import { PriorityBadge, StatusBadge } from "@/components/portal/common";
import { PROJECT_STATUSES, STATUS_META } from "@/lib/statuses";
import { formatDateShort, relativeDeadline } from "@/lib/format";
import { cn } from "@/lib/cn";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "My projects", path: "/editor/projects", noindex: true });

export default async function EditorProjects({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("editor", "/editor/projects");
  const sp = await searchParams;
  const scope = first(sp.scope) === "all" ? "all" : "open";
  const f = { q: first(sp.q), status: first(sp.status), sort: first(sp.sort) ?? "deadline" };
  const res = await guard(() => listProjectsStaff(actor, { ...f, view: f.status ? "all" : scope, page: num(sp.page), pageSize: 25 }));
  const filtered = Boolean(f.q || f.status);
  return (
    <>
      <PageHeader title="My projects" description="Projects you're assigned to. Open one for the brief, files, versions and revisions." />
      <TabNav basePath="/editor/projects" param="scope" active={scope} tabs={[{ key: "open", label: "Open" }, { key: "all", label: "All (incl. delivered)" }]} />
      <Card className="overflow-visible">
        <FilterBar
          action="/editor/projects"
          values={f}
          fields={[
            { name: "q", label: "Search projects", placeholder: "Search name, code, client…" },
            { name: "status", label: "Status", type: "select", options: PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })) },
            { name: "sort", label: "Sort", type: "select", options: [{ value: "deadline", label: "Deadline" }, { value: "priority", label: "Priority" }, { value: "updated", label: "Recently updated" }, { value: "oldest", label: "Oldest" }] },
          ]}
        >
          <input type="hidden" name="scope" value={scope} />
        </FilterBar>
        <DataTable
          rows={res.items}
          rowKey={(p) => p.id}
          rowHref={(p) => `/editor/projects/${p.id}`}
          empty={<EmptyState icon="film" title={filtered ? "No projects match these filters" : "No projects assigned to you yet"} description={filtered ? "Try clearing a filter." : "When the studio assigns you to a project it will appear here."} />}
          columns={[
            { key: "n", header: "Project", primary: true, render: (p) => <span><span className="font-bold">{p.name}</span><span className="block text-xs font-normal text-muted">{p.code} · {p.client.companyName}</span></span> },
            { key: "s", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            { key: "pr", header: "Priority", hideOnMobile: true, render: (p) => (p.priority === "NORMAL" ? <span className="text-subtle">Normal</span> : <PriorityBadge value={p.priority} />) },
            { key: "d", header: "Deadline", render: (p) => (p.deadline ? <span className={cn(new Date(p.deadline) < new Date() && !["DELIVERED", "APPROVED", "ARCHIVED", "CANCELLED"].includes(p.status) && "font-bold text-danger")} title={formatDateShort(p.deadline)}>{relativeDeadline(p.deadline)}</span> : "—") },
            { key: "e", header: "Team", hideOnMobile: true, render: (p) => p.editors.map((e) => e.name).join(", ") || <span className="text-subtle">—</span> },
            { key: "r", header: "Open rev.", hideOnMobile: true, align: "right", render: (p) => p.openRevisions || "—" },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/editor/projects" params={{ ...f, scope: scope === "open" ? undefined : scope }} />
      </Card>
    </>
  );
}
