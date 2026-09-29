"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { PROJECT_STATUSES, STATUS_META } from "@/lib/statuses";

const ACTION_TYPES = [["EMAIL", "Send email", "mail"], ["NOTIFICATION", "In-app notification", "bell"], ["ADMIN_ALERT", "Alert the team", "alert"], ["CLIENT_REMINDER", "Remind the client", "clock"], ["STATUS_UPDATE", "Change project status", "refresh"], ["CREATE_TASK", "Create a task", "checklist"]] as const;
const RECIPIENTS = [["client", "The client"], ["client_billing", "Client billing contact"], ["manager", "Project manager"], ["editors", "Assigned editors"], ["team", "Whole project team"], ["lead_owner", "Lead owner"], ["admins", "Admins"], ["finance", "Finance"]];
const OPS = [["eq", "is"], ["neq", "is not"], ["in", "is one of"], ["gt", "greater than"], ["lt", "less than"], ["exists", "is present"]] as const;

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  event: string;
  enabled: boolean;
  isSystem: boolean;
  conditions: any;
  actions: { id: string; type: string; config: Record<string, any>; delayMinutes: number }[];
  runs: number;
}
interface ActionDraft { type: string; config: Record<string, any>; delayMinutes: number }

const blankAction = (type = "EMAIL"): ActionDraft => ({ type, config: type === "EMAIL" ? { recipient: "client", templateKey: "" } : type === "STATUS_UPDATE" ? { toStatus: "EDITING" } : type === "CREATE_TASK" ? { taskTitle: "", assignee: "manager", priority: "NORMAL", dueInDays: 2 } : { recipient: type === "ADMIN_ALERT" ? "admins" : "client", title: "", message: "", link: "" }, delayMinutes: 0 });

export function AutomationManager({ automations, events, templates, canManage }: { automations: AutomationRow[]; events: { value: string; label: string }[]; templates: { key: string; name: string }[]; canManage: boolean }) {
  const toast = useToast();
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);
  const [del, setDel] = useState<AutomationRow | null>(null);
  const toggle = useAction(async (a: AutomationRow) => api(`/api/admin/automations/${a.id}/toggle`, { body: { enabled: !a.enabled } }), { onError: (e) => toast.error("Couldn't update", e.message) });
  const remove = useAction(async (id: string) => api(`/api/admin/automations/${id}`, { method: "DELETE" }), { onSuccess: () => (setDel(null), toast.success("Automation deleted")), onError: (e) => toast.error("Couldn't delete", e.message) });
  const label = (e: string) => events.find((x) => x.value === e)?.label ?? e;
  const groups = [...new Set(automations.map((a) => a.event))];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{automations.filter((a) => a.enabled).length} of {automations.length} automations are on. Turning one off stops it immediately; nothing is deleted.</p>
        {canManage ? <Button className="ml-auto" icon="plus" variant="dark" onClick={() => setEditing("new")}>New automation</Button> : null}
      </div>
      {!automations.length ? <Card><EmptyState icon="workflow" title="No automations yet" description="Run the database seed to install the default set, or create your own." /></Card> : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-subtle">When: {label(g)}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
                {automations.filter((a) => a.event === g).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                    <div className="min-w-0 flex-1 basis-64">
                      <button type="button" onClick={() => setEditing(a)} className="text-left text-sm font-bold hover:text-accent hover:underline">{a.name}</button>
                      {a.description ? <p className="mt-0.5 text-xs text-muted">{a.description}</p> : null}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{a.actions.map((x) => <Badge key={x.id} tone="neutral" dot={false} icon={ACTION_TYPES.find((t) => t[0] === x.type)?.[2] ?? "zap"}>{ACTION_TYPES.find((t) => t[0] === x.type)?.[1] ?? x.type}{x.delayMinutes ? ` · after ${fmtDelay(x.delayMinutes)}` : ""}</Badge>)}</div>
                    </div>
                    {a.isSystem ? <Badge tone="info" dot={false} icon={false}>built-in</Badge> : null}
                    <span className="text-xs text-subtle">{a.runs} run{a.runs === 1 ? "" : "s"}</span>
                    <Switch checked={a.enabled} disabled={!canManage} onChange={() => void toggle.run(a)} label={<span className="sr-only">{a.name} enabled</span>} />
                    {canManage ? <button type="button" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="pencil" size={15} /></button> : null}
                    {canManage && !a.isSystem ? <button type="button" aria-label={`Delete ${a.name}`} onClick={() => setDel(a)} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing ? <Editor key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} events={events} templates={templates} onClose={() => setEditing(null)} /> : null}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} tone="danger" loading={remove.pending} title="Delete this automation?" description={del ? `“${del.name}” will stop running. Past runs stay in the audit trail.` : undefined} confirmLabel="Delete" onConfirm={() => { if (del) void remove.run(del.id); }} />
    </div>
  );
}

const fmtDelay = (m: number) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`);

function Editor({ row, events, templates, onClose }: { row: AutomationRow | null; events: { value: string; label: string }[]; templates: { key: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [event, setEvent] = useState(row?.event ?? events[0]?.value ?? "");
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [acts, setActs] = useState<ActionDraft[]>(row?.actions.map((a) => ({ type: a.type, config: { ...a.config }, delayMinutes: a.delayMinutes })) ?? [blankAction()]);
  const initialConds = ((row?.conditions?.all ?? row?.conditions?.any ?? []) as any[]).map((c) => ({ field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "") }));
  const [conds, setConds] = useState<{ field: string; op: string; value: string }[]>(initialConds);
  const setAct = (i: number, patch: Partial<ActionDraft> & { cfg?: Record<string, any> }) => setActs(acts.map((a, j) => (j === i ? { ...a, ...(patch.type ? { type: patch.type, config: blankAction(patch.type).config } : {}), ...(patch.delayMinutes !== undefined ? { delayMinutes: patch.delayMinutes } : {}), ...(patch.cfg ? { config: { ...a.config, ...patch.cfg } } : {}) } : a)));
  const save = useAction(
    async () => {
      const body = {
        name, description: description || null, event, enabled,
        conditions: conds.length ? { all: conds.filter((c) => c.field).map((c) => ({ field: c.field, op: c.op, ...(c.op === "exists" ? {} : { value: c.op === "in" ? c.value.split(",").map((s) => s.trim()) : isNaN(Number(c.value)) || c.value === "" ? c.value : Number(c.value) }) })) } : null,
        actions: acts.map((a) => ({ type: a.type, config: a.config, delayMinutes: a.delayMinutes })),
      };
      return row ? api(`/api/admin/automations/${row.id}`, { method: "PUT", body }) : api("/api/admin/automations", { body });
    },
    { onSuccess: () => (toast.success(row ? "Automation saved" : "Automation created"), onClose()), onError: (e) => toast.error("Couldn't save", e.message) },
  );
  return (
    <Modal open onClose={onClose} size="xl" title={row ? "Edit automation" : "New automation"} description="When something happens, do something — automatically." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.pending} disabled={!name.trim()} onClick={() => void save.run()}>{row ? "Save changes" : "Create automation"}</Button></>}>
      <div className="space-y-7">
        {save.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{save.error}</p> : null}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Description" className="sm:col-span-2">{(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
          <Field label="Trigger — when this happens" optional={false}>{(p) => <Select {...p} value={event} onChange={(e) => setEvent(e.target.value)}>{events.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</Select>}</Field>
          <div className="flex items-end pb-1"><Switch checked={enabled} onChange={setEnabled} label="Enabled" /></div>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-extrabold">Only if… <span className="font-medium text-subtle">(optional)</span></h3>
          <p className="mb-3 text-xs text-muted">Conditions look at the event's data, e.g. <code>toStatus</code> is <code>CLIENT_REVIEW</code> for a status change.</p>
          <div className="space-y-2">
            {conds.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
                <Input aria-label="Field" placeholder="field (e.g. toStatus)" value={c.field} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className="font-mono" />
                <select aria-label="Operator" value={c.op} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm">{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {c.op === "exists" ? <span /> : <Input aria-label="Value" placeholder="value" value={c.value} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                <button type="button" aria-label="Remove condition" onClick={() => setConds(conds.filter((_, j) => j !== i))} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" icon="plus" onClick={() => setConds([...conds, { field: "", op: "eq", value: "" }])}>Add condition</Button>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-extrabold">Then do this</h3>
          <div className="space-y-3">
            {acts.map((a, i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface-2/30 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fg text-xs font-bold text-bg">{i + 1}</span>
                  <select aria-label="Action type" value={a.type} onChange={(e) => setAct(i, { type: e.target.value })} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">{ACTION_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted">Wait <input aria-label="Delay in minutes" type="number" min={0} value={a.delayMinutes} onChange={(e) => setAct(i, { delayMinutes: Number(e.target.value) })} className="h-9 w-20 rounded-lg border border-line-strong bg-surface px-2 text-sm text-fg" /> min first</label>
                  {acts.length > 1 ? <button type="button" aria-label="Remove action" onClick={() => setActs(acts.filter((_, j) => j !== i))} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button> : null}
                </div>
                <ActionFields a={a} templates={templates} set={(cfg) => setAct(i, { cfg })} />
              </div>
            ))}
            {acts.length < 10 ? <Button size="sm" variant="outline" icon="plus" onClick={() => setActs([...acts, blankAction("NOTIFICATION")])}>Add another action</Button> : null}
          </div>
          <p className="mt-3 text-xs text-muted">Use placeholders like <code>{"{{client_name}}"}</code>, <code>{"{{project_name}}"}</code>, <code>{"{{amount}}"}</code>, <code>{"{{deadline}}"}</code>, <code>{"{{project_url}}"}</code>.</p>
        </section>
      </div>
    </Modal>
  );
}

function ActionFields({ a, templates, set }: { a: ActionDraft; templates: { key: string; name: string }[]; set: (cfg: Record<string, any>) => void }) {
  const c = a.config;
  if (a.type === "STATUS_UPDATE") return <Field label="Move the project to" optional={false}>{(p) => <Select {...p} value={c.toStatus ?? ""} onChange={(e) => set({ toStatus: e.target.value })}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</Select>}</Field>;
  if (a.type === "CREATE_TASK")
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Task title" required className="sm:col-span-2">{(p) => <Input {...p} value={c.taskTitle ?? ""} onChange={(e) => set({ taskTitle: e.target.value })} placeholder="e.g. Follow up on {{project_name}}" />}</Field>
        <Field label="Assign to" optional={false}>{(p) => <Select {...p} value={c.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value })}><option value="manager">Project manager</option><option value="editor">Assigned editor</option><option value="">Unassigned</option></Select>}</Field>
        <Field label="Due in (days)" optional={false}>{(p) => <Input {...p} type="number" min={0} value={c.dueInDays ?? 2} onChange={(e) => set({ dueInDays: Number(e.target.value) })} />}</Field>
      </div>
    );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Send to" optional={false}>{(p) => <Select {...p} value={c.recipient ?? ""} onChange={(e) => set({ recipient: e.target.value })}>{RECIPIENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
      {a.type === "EMAIL" ? (
        <Field label="Email template" required>{(p) => <Select {...p} value={c.templateKey ?? ""} onChange={(e) => set({ templateKey: e.target.value })}><option value="">Choose…</option>{templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</Select>}</Field>
      ) : (
        <Field label="Title" required>{(p) => <Input {...p} value={c.title ?? ""} onChange={(e) => set({ title: e.target.value })} />}</Field>
      )}
      {a.type !== "EMAIL" ? <Field label="Message" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={c.message ?? ""} onChange={(e) => set({ message: e.target.value })} />}</Field> : null}
      {a.type !== "EMAIL" ? <Field label="Link (app path)" className="sm:col-span-2">{(p) => <Input {...p} value={c.link ?? ""} onChange={(e) => set({ link: e.target.value })} placeholder="{{base}}/projects/{{project_pid}}" />}</Field> : null}
    </div>
  );
}
