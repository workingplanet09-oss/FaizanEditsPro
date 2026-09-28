import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { listProjectsStaff, listAssignable } from "@/server/services/projects";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader, Avatar } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { TabNav } from "@/components/ui/tabs";
import { PaymentBadge, PriorityBadge, StatusBadge } from "@/components/portal/common";
import { PIPELINE, STATUS_META, PROJECT_STATUSES } from "@/lib/statuses";
import { formatDateShort, relativeDeadline } from "@/lib/format";
import { cn } from "@/lib/cn";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Projects", path: "/admin/projects", noindex: true });

export default async function ProjectsAdminPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/projects");
  const sp = await searchParams;
  const view = first(sp.view) ?? "table";
  const stage = first(sp.stage);
  const stageStatuses = stage ? PIPELINE.find((s) => s.key === stage)?.statuses.join(",") : undefined;
  const f = { q: first(sp.q), status: first(sp.status) ?? stageStatuses, priority: first(sp.priority), payment: first(sp.payment), deadline: first(sp.deadline), editorId: first(sp.editorId), sort: first(sp.sort) };
  const scope = first(sp.scope) === "all" ? "all" : "open";
  const isBoard = view === "board";
  const res = await guard(() => listProjectsStaff(actor, { ...f, view: f.status ? "all" : scope, page: num(sp.page), pageSize: isBoard ? 200 : 25 }));
  const staff = can(actor, "projects:assign") ? await listAssignable(actor) : [];
  const params = { ...f, scope: scope === "open" ? undefined : scope, view: isBoard ? "board" : undefined } as Record<string, string | undefined>;
  return (
    <>
      <PageHeader title="Projects" description="Every project from inquiry to delivery." actions={can(actor, "projects:write") ? <ButtonLink href="/admin/projects/new" icon="plus" variant="dark">New project</ButtonLink> : null} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabNav basePath="/admin/projects" param="scope" active={scope} tabs={[{ key: "open", label: "Open" }, { key: "all", label: "All (incl. delivered)" }]} extra={{ ...Object.fromEntries(Object.entries(f)), view: isBoard ? "board" : undefined } as Record<string, string | undefined>} />
        <div className="-mt-6 inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="group" aria-label="View">
          {[["table", "Table"], ["board", "Board"]].map(([k, l]) => (
            <Link key={k} href={{ pathname: "/admin/projects", query: { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), view: k === "board" ? "board" : undefined } }} aria-current={view === k ? "page" : undefined} className={cn("rounded-lg px-3.5 py-1.5", view === k ? "bg-surface shadow-soft" : "text-muted hover:text-fg")}>{l}</Link>
          ))}
        </div>
      </div>
      <Card className="overflow-visible">
        <FilterBar
          action="/admin/projects"
          values={f}
          fields={[
            { name: "q", label: "Search projects", placeholder: "Search name, code, client…" },
            { name: "status", label: "Status", type: "select", options: PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })) },
            { name: "priority", label: "Priority", type: "select", options: [["URGENT", "Urgent"], ["HIGH", "High"], ["NORMAL", "Normal"], ["LOW", "Low"]].map(([value, label]) => ({ value, label })) },
            { name: "payment", label: "Payment", type: "select", options: [{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Has unpaid invoice" }, { value: "none", label: "No invoice" }] },
            { name: "deadline", label: "Deadline", type: "select", options: [{ value: "overdue", label: "Overdue" }, { value: "week", label: "Next 7 days" }, { value: "month", label: "Next 30 days" }, { value: "none", label: "No deadline" }] },
            { name: "editorId", label: "Editor", type: "select", options: staff.map((s) => ({ value: s.id, label: s.name })) },
            { name: "sort", label: "Sort", type: "select", options: [{ value: "deadline", label: "Deadline" }, { value: "priority", label: "Priority" }, { value: "updated", label: "Recently updated" }, { value: "oldest", label: "Oldest" }] },
          ]}
        >
          {isBoard ? <input type="hidden" name="view" value="board" /> : null}
          <input type="hidden" name="scope" value={scope} />
        </FilterBar>
        {isBoard ? (
          <div className="thin-scroll flex gap-4 overflow-x-auto p-4">
            {PIPELINE.map((col) => {
              const items = res.items.filter((p) => col.statuses.includes(p.status));
              return (
                <section key={col.key} aria-label={col.label} className="w-72 shrink-0">
                  <h3 className="mb-3 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-muted">{col.label}<span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">{items.length}</span></h3>
                  <ul className="space-y-2.5">
                    {items.map((p) => (
                      <li key={p.id}>
                        <Link href={`/admin/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-3.5 shadow-soft transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">
                          <div className="flex items-start justify-between gap-2"><span className="text-[11px] font-bold text-subtle">{p.code}</span><PriorityBadge value={p.priority} className={p.priority === "NORMAL" ? "hidden" : ""} /></div>
                          <div className="mt-1 text-sm font-bold leading-snug">{p.name}</div>
                          <div className="truncate text-xs text-muted">{p.client.companyName}</div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><StatusBadge status={p.status} />{p.openRevisions ? <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">{p.openRevisions} rev</span> : null}</div>
                          <div className="mt-2.5 flex items-center justify-between text-xs text-muted"><span className={cn(p.deadline && new Date(p.deadline) < new Date() && !["DELIVERED", "APPROVED"].includes(p.status) && "font-bold text-danger")}>{p.deadline ? relativeDeadline(p.deadline) : "No deadline"}</span><span className="flex -space-x-1.5">{p.editors.slice(0, 3).map((e) => <Avatar key={e.id} name={e.name} size={20} className="ring-2 ring-surface" />)}</span></div>
                        </Link>
                      </li>
                    ))}
                    {!items.length ? <li className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-subtle">Nothing here</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            <DataTable
              rows={res.items}
              rowKey={(p) => p.id}
              rowHref={(p) => `/admin/projects/${p.id}`}
              empty={<EmptyState icon="film" title={Object.values(f).some(Boolean) ? "No projects match these filters" : "No projects yet"} description={Object.values(f).some(Boolean) ? "Try clearing a filter." : "Convert a lead or create a project to get started."} action={can(actor, "projects:write") ? <ButtonLink href="/admin/projects/new">New project</ButtonLink> : undefined} />}
              columns={[
                { key: "n", header: "Project", primary: true, render: (p) => <span><span className="font-bold">{p.name}</span><span className="block text-xs font-normal text-muted">{p.code} · {p.client.companyName}</span></span> },
                { key: "s", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
                { key: "pr", header: "Priority", hideOnMobile: true, render: (p) => (p.priority === "NORMAL" ? <span className="text-subtle">Normal</span> : <PriorityBadge value={p.priority} />) },
                { key: "d", header: "Deadline", render: (p) => (p.deadline ? <span className={cn(new Date(p.deadline) < new Date() && !["DELIVERED", "APPROVED", "ARCHIVED", "CANCELLED"].includes(p.status) && "font-bold text-danger")} title={formatDateShort(p.deadline)}>{relativeDeadline(p.deadline)}</span> : "—") },
                { key: "e", header: "Team", hideOnMobile: true, render: (p) => p.editors.map((e) => e.name).join(", ") || <span className="text-subtle">Unassigned</span> },
                { key: "pay", header: "Payment", hideOnMobile: true, render: (p) => <PaymentBadge state={p.paymentState} /> },
                { key: "r", header: "Rev.", hideOnMobile: true, align: "right", render: (p) => p.openRevisions || "—" },
              ]}
            />
            <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/projects" params={params} />
          </>
        )}
      </Card>
    </>
  );
}
