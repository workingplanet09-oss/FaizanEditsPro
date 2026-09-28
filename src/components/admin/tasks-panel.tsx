"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/statuses";
import { formatDateShort, relativeDeadline } from "@/lib/format";

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string; code: string } | null;
  subtasks?: { id: string; title: string; status: string }[];
}

const STATUSES = Object.entries(TASK_STATUS_META);

/** Task list with inline status/assignee changes. Used on project pages, the admin task board and the editor workspace. */
export function TasksPanel({ tasks, staff, projectId, canWrite, showProject = false, base = "/admin", title = "Tasks", meId }: { tasks: TaskRow[]; staff: { id: string; name: string }[]; projectId?: string; canWrite: boolean; showProject?: boolean; base?: "/admin" | "/editor"; title?: string; meId?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: "", assigneeId: meId ?? "", priority: "NORMAL", dueDate: "", projectId: projectId ?? "" });
  const patch = useAction(async (id: string, body: Record<string, unknown>) => api(`/api/tasks/${id}`, { method: "PATCH", body }), { onError: (e) => toast.error("Couldn't update task", e.message) });
  const del = useAction(async (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }), { onSuccess: () => toast.success("Task deleted") });
  const add = useAction(async () => api("/api/tasks", { body: { title: v.title, projectId: v.projectId || null, assigneeId: v.assigneeId || null, priority: v.priority, dueDate: v.dueDate || null } }), {
    onSuccess: () => (setOpen(false), setV({ ...v, title: "", dueDate: "" }), toast.success("Task created")),
    onError: (e) => toast.error("Couldn't create task", e.message),
  });
  const order = ["BLOCKED", "IN_PROGRESS", "REVIEW", "TODO", "COMPLETE"];
  const sorted = [...tasks].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <Card>
      <CardHeader title={title} description={`${tasks.filter((t) => t.status !== "COMPLETE").length} open · ${tasks.filter((t) => t.status === "COMPLETE").length} done`} action={canWrite ? <Button size="sm" icon="plus" onClick={() => setOpen(true)}>Add task</Button> : null} />
      {!sorted.length ? (
        <EmptyState icon="checklist" title="No tasks yet" description={canWrite ? "Add the first task to keep the work organised." : "Nothing assigned here."} />
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((t) => {
            const late = t.dueDate && t.status !== "COMPLETE" && new Date(t.dueDate) < new Date();
            const pr = PRIORITY_META[t.priority];
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <button type="button" disabled={!canWrite} aria-label={t.status === "COMPLETE" ? "Mark as to do" : "Mark complete"} onClick={() => void patch.run(t.id, { status: t.status === "COMPLETE" ? "TODO" : "COMPLETE" })} className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition", t.status === "COMPLETE" ? "border-success bg-success text-white" : "border-line-strong hover:border-accent")}>
                  {t.status === "COMPLETE" ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                </button>
                <div className="min-w-0 flex-1 basis-56">
                  <div className={cn("truncate text-sm font-semibold", t.status === "COMPLETE" && "text-muted line-through")}>{t.title}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-subtle">
                    {showProject && t.project ? <Link href={`${base}/projects/${t.project.id}`} className="hover:text-fg hover:underline">{t.project.code} · {t.project.name}</Link> : null}
                    {t.subtasks?.length ? <span>{t.subtasks.filter((s) => s.status === "COMPLETE").length}/{t.subtasks.length} subtasks</span> : null}
                  </div>
                </div>
                {t.priority !== "NORMAL" ? <Badge tone={pr?.tone ?? "neutral"} dot={false} icon={false}>{pr?.label}</Badge> : null}
                <span className={cn("w-24 shrink-0 text-xs", late ? "font-bold text-danger" : "text-muted")} title={t.dueDate ? formatDateShort(t.dueDate) : undefined}>{t.dueDate ? relativeDeadline(t.dueDate) : "No due date"}</span>
                {canWrite ? (
                  <>
                    <select aria-label="Assignee" value={t.assignee?.id ?? ""} onChange={(e) => void patch.run(t.id, { assigneeId: e.target.value || null })} className="h-8 w-32 rounded-lg border border-line bg-surface px-2 text-xs font-medium">
                      <option value="">Unassigned</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select aria-label="Status" value={t.status} onChange={(e) => void patch.run(t.id, { status: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs font-semibold">
                      {STATUSES.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </select>
                    <button type="button" aria-label={`Delete ${t.title}`} onClick={() => void del.run(t.id)} className="rounded-lg p-1.5 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={14} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted">{t.assignee?.name ?? "Unassigned"}</span>
                    <Badge tone={TASK_STATUS_META[t.status]?.tone ?? "neutral"}>{TASK_STATUS_META[t.status]?.label ?? t.status}</Badge>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="New task" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.pending} disabled={!v.title.trim()} onClick={() => void add.run()}>Create task</Button></>}>
        <div className="space-y-4">
          {add.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{add.error}</p> : null}
          <Field label="Title" required>{(p) => <Input {...p} autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Colour-grade the opening" />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assignee">{(p) => <Select {...p} value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: e.target.value })}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
            <Field label="Priority">{(p) => <Select {...p} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select>}</Field>
          </div>
          <Field label="Due date">{(p) => <Input {...p} type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} />}</Field>
        </div>
      </Modal>
    </Card>
  );
}
