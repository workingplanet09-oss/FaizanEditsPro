import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { editorHome } from "@/server/services/analytics";
import { myTimer } from "@/server/services/time";
import { can } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { StatusBadge, PriorityBadge } from "@/components/portal/common";
import { TimerWidget } from "@/components/admin/timer-widget";
import { greeting, relativeDeadline, timeAgo } from "@/lib/format";
import { PRIORITY_META } from "@/lib/statuses";
import { cn } from "@/lib/cn";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "My work", path: "/editor", noindex: true });

export default async function EditorHome() {
  const actor = await requirePageActor("editor", "/editor");
  const [h, timer] = await guard(() => Promise.all([editorHome(actor), can(actor, "time:track") ? myTimer(actor) : Promise.resolve(null)]));
  const now = new Date();
  const overdueTasks = h.tasksToday.filter((t) => t.dueDate && new Date(t.dueDate) < now).length;
  const first = actor.name.split(" ")[0];
  return (
    <>
      <PageHeader title={`${greeting()}, ${first}`} description="What's on your plate today." />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active projects" value={h.projects.length} icon="film" href="/editor/projects" />
        <Stat label="Tasks due today" value={h.tasksToday.length} sub={overdueTasks ? `${overdueTasks} overdue` : undefined} tone={overdueTasks ? "danger" : undefined} icon="checklist" href="/editor/tasks" />
        <Stat label="Open revisions" value={h.revisions.length} tone={h.revisions.length ? "warning" : undefined} icon="refresh" href="/editor/revisions" />
        <Stat label="Deadlines in 10 days" value={h.deadlines.length} icon="clock" href="/editor/projects?sort=deadline" />
      </div>

      {can(actor, "time:track") ? <div className="mb-6 max-w-xl"><TimerWidget running={timer as any} base="/editor" /></div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Today's tasks" description="Due today, overdue or in progress." action={<Link href="/editor/tasks" className="text-sm font-semibold text-accent hover:underline">All tasks</Link>} />
            {h.tasksToday.length ? (
              <ul className="divide-y divide-line">
                {h.tasksToday.map((t) => {
                  const late = t.dueDate && new Date(t.dueDate) < now;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.status === "IN_PROGRESS" ? "bg-info" : t.status === "BLOCKED" ? "bg-danger" : "bg-line-strong")} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{t.title}</div>
                        {t.project ? <Link href={`/editor/projects/${t.project.id}?tab=tasks`} className="text-xs text-muted hover:underline">{t.project.code} · {t.project.name}</Link> : null}
                      </div>
                      {t.priority !== "NORMAL" ? <span className={cn("text-xs font-bold", PRIORITY_META[t.priority]?.tone === "danger" && "text-danger")}>{PRIORITY_META[t.priority]?.label}</span> : null}
                      {t.dueDate ? <span className={cn("text-xs", late ? "font-bold text-danger" : "text-subtle")}>{relativeDeadline(t.dueDate)}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState icon="check-circle" title="You're all caught up" description="No tasks due today." />}
          </Card>

          <Card>
            <CardHeader title="My projects" description="Everything currently assigned to you." action={<Link href="/editor/projects" className="text-sm font-semibold text-accent hover:underline">View all</Link>} />
            {h.projects.length ? (
              <ul className="divide-y divide-line">
                {h.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/editor/projects/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition hover:bg-surface-2/60">
                      <div className="min-w-0 flex-1 basis-48"><div className="truncate text-sm font-bold">{p.name}</div><div className="truncate text-xs text-muted">{p.code} · {p.client.companyName}</div></div>
                      <StatusBadge status={p.status} />
                      {p.priority !== "NORMAL" ? <PriorityBadge value={p.priority} /> : null}
                      <span className={cn("w-24 text-right text-xs", p.deadline && new Date(p.deadline) < now ? "font-bold text-danger" : "text-subtle")}>{p.deadline ? relativeDeadline(p.deadline) : "No deadline"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="film" title="No active projects" description="When a project is assigned to you it will show up here." />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Revision requests" description="Feedback waiting for a new version." action={<Link href="/editor/revisions" className="text-sm font-semibold text-accent hover:underline">Board</Link>} />
            {h.revisions.length ? (
              <ul className="divide-y divide-line">
                {h.revisions.map((r) => (
                  <li key={r.id}>
                    <Link href={`/editor/projects/${r.project.id}?tab=revisions`} className="block px-5 py-3 transition hover:bg-surface-2/60">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">Round {r.roundNumber} · {r.version?.label ?? "latest version"}</span><span className="shrink-0 text-xs text-subtle">{timeAgo(r.createdAt)}</span></div>
                      <div className="text-xs text-muted">{r.project.code} · {r.project.name}{r._count.comments ? ` · ${r._count.comments} comment${r._count.comments === 1 ? "" : "s"}` : ""}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 text-sm text-muted">No open revision requests.</p>}
          </Card>

          <Card>
            <CardHeader title="Upcoming deadlines" description="Next 10 days." />
            {h.deadlines.length ? (
              <ul className="divide-y divide-line">
                {h.deadlines.map((d) => (
                  <li key={d.id}><Link href={`/editor/projects/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/60"><span className="min-w-0 truncate font-semibold">{d.name}</span><span className="shrink-0 text-xs font-semibold text-warning">{d.deadline ? relativeDeadline(d.deadline) : ""}</span></Link></li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 text-sm text-muted">Nothing due in the next 10 days.</p>}
          </Card>

          <Card>
            <CardHeader title="New client files" description="Uploaded in the last 3 days." />
            {h.newFiles.length ? (
              <ul className="divide-y divide-line">
                {h.newFiles.map((f) => (
                  <li key={f.id}><Link href={f.project ? `/editor/projects/${f.project.id}?tab=files` : "/editor/files"} className="block px-5 py-3 transition hover:bg-surface-2/60"><div className="truncate text-sm font-semibold">{f.displayName}</div><div className="text-xs text-muted">{f.project?.name ?? "Unassigned"} · {timeAgo(f.createdAt)}</div></Link></li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 text-sm text-muted">No new uploads from clients.</p>}
          </Card>

          {h.awaitingReview.length ? (
            <Card>
              <CardHeader title="Waiting on review" description="Out of your hands for now." />
              <ul className="divide-y divide-line">
                {h.awaitingReview.map((p) => (
                  <li key={p.id}><Link href={`/editor/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/60"><span className="min-w-0 truncate font-semibold">{p.name}</span><StatusBadge status={p.status} /></Link></li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
