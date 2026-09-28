import { requirePageActor, can } from "@/server/auth/actor";
import { listTasks } from "@/server/services/tasks";
import { listAssignable } from "@/server/services/projects";
import { db } from "@/server/db";
import { guard, first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { TasksPanel } from "@/components/admin/tasks-panel";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Tasks", path: "/admin/tasks", noindex: true });

export default async function TasksAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/tasks");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "open";
  const query = tab === "mine" ? { mine: "1", status: "TODO,IN_PROGRESS,REVIEW,BLOCKED" } : tab === "overdue" ? { due: "overdue" } : tab === "today" ? { due: "today" } : tab === "done" ? { status: "COMPLETE" } : { status: "TODO,IN_PROGRESS,REVIEW,BLOCKED" };
  const [res, staff, projects] = await guard(() => Promise.all([listTasks(actor, { ...query, pageSize: 200 }), can(actor, "projects:assign") ? listAssignable(actor) : Promise.resolve([]), db.project.findMany({ where: { workspaceId: actor.workspaceId, status: { notIn: ["ARCHIVED", "CANCELLED", "DELIVERED"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, code: true, name: true } })]));
  return (
    <>
      <PageHeader title="Tasks" description="Everything the team needs to do, across all projects." />
      <TabNav basePath="/admin/tasks" active={tab} tabs={[{ key: "open", label: "Open" }, { key: "mine", label: "Assigned to me" }, { key: "today", label: "Due today" }, { key: "overdue", label: "Overdue" }, { key: "done", label: "Completed" }]} />
      <TasksPanel tasks={res.items as any} staff={staff} canWrite={can(actor, "tasks:write")} showProject meId={actor.userId} projects={projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))} openNew={first(sp.new) === "1"} title={tab === "done" ? "Completed tasks" : "Tasks"} />
    </>
  );
}
