import { requirePageActor, can } from "@/server/auth/actor";
import { listTasks } from "@/server/services/tasks";
import { listAssignable } from "@/server/services/projects";
import { listProjectsStaff } from "@/server/services/projects";
import { guard, first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { TasksPanel } from "@/components/admin/tasks-panel";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "My tasks", path: "/editor/tasks", noindex: true });

export default async function EditorTasks({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("editor", "/editor/tasks");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "open";
  const query = tab === "today" ? { due: "today" } : tab === "overdue" ? { due: "overdue" } : tab === "done" ? { status: "COMPLETE" } : { status: "TODO,IN_PROGRESS,REVIEW,BLOCKED" };
  const canWrite = can(actor, "tasks:write");
  const [res, staff, projects] = await guard(() => Promise.all([
    listTasks(actor, { ...query, mine: "1", pageSize: 200 }),
    can(actor, "projects:assign") ? listAssignable(actor) : Promise.resolve([]),
    canWrite ? listProjectsStaff(actor, { view: "open", pageSize: 100 }) : Promise.resolve({ items: [] as { id: string; code: string; name: string }[] }),
  ]));
  return (
    <>
      <PageHeader title="My tasks" description="Tasks assigned to you across your projects." />
      <TabNav basePath="/editor/tasks" active={tab} tabs={[{ key: "open", label: "Open" }, { key: "today", label: "Due today" }, { key: "overdue", label: "Overdue" }, { key: "done", label: "Completed" }]} />
      <TasksPanel base="/editor" tasks={res.items as any} staff={staff} canWrite={canWrite} showProject meId={actor.userId} projects={projects.items.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))} openNew={first(sp.new) === "1"} title={tab === "done" ? "Completed tasks" : "Tasks"} />
    </>
  );
}
