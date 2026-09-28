"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PRIORITY_META } from "@/lib/statuses";

interface Opt { id: string; label: string }
export function NewProjectForm({ clients, services, types, templates, staff, defaults, currencies }: { clients: Opt[]; services: Opt[]; types: { key: string; label: string }[]; templates: Opt[]; staff: Opt[]; defaults: { clientId?: string; managerId?: string; currency: string }; currencies: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ clientId: defaults.clientId ?? "", name: "", description: "", serviceId: "", projectTypeKey: "", templateId: "", priority: "NORMAL", deadline: "", managerId: defaults.managerId ?? "", currency: defaults.currency, revisionLimit: "", clientVisible: false });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const go = useAction(async () => api<{ id: string }>("/api/projects", { body: { clientId: v.clientId, name: v.name, description: v.description || null, serviceId: v.serviceId || null, projectTypeKey: v.projectTypeKey || null, templateId: v.templateId || null, priority: v.priority, deadline: v.deadline || null, managerId: v.managerId || null, currency: v.currency, revisionLimit: v.revisionLimit ? Number(v.revisionLimit) : undefined, clientVisible: v.clientVisible } }), {
    refresh: false,
    onSuccess: (p) => (toast.success("Project created"), router.push(`/admin/projects/${p.id}`)),
  });
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="grid max-w-4xl gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:grid-cols-2">
      {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{go.error}</p> : null}
      <Field label="Client" required error={go.fields.clientId} className="sm:col-span-2">{(p) => <Select {...p} value={v.clientId} onChange={set("clientId")}><option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
      <Field label="Project name" required error={go.fields.name} className="sm:col-span-2">{(p) => <Input {...p} value={v.name} onChange={set("name")} placeholder="e.g. Autumn campaign — 6 shorts" />}</Field>
      <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={v.description} onChange={set("description")} />}</Field>
      <Field label="Service">{(p) => <Select {...p} value={v.serviceId} onChange={set("serviceId")}><option value="">—</option>{services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}</Field>
      <Field label="Project type" hint="Drives the brief questions.">{(p) => <Select {...p} value={v.projectTypeKey} onChange={set("projectTypeKey")}><option value="">—</option>{types.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>}</Field>
      <Field label="Template" hint="Pre-fills tasks and deliverables.">{(p) => <Select {...p} value={v.templateId} onChange={set("templateId")}><option value="">None</option>{templates.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}</Field>
      <Field label="Project manager">{(p) => <Select {...p} value={v.managerId} onChange={set("managerId")}><option value="">None</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}</Field>
      <Field label="Priority" optional={false}>{(p) => <Select {...p} value={v.priority} onChange={set("priority")}>{Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select>}</Field>
      <Field label="Deadline">{(p) => <Input {...p} type="date" value={v.deadline} onChange={set("deadline")} />}</Field>
      <Field label="Currency" optional={false}>{(p) => <Select {...p} value={v.currency} onChange={set("currency")}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
      <Field label="Included revision rounds" hint="Leave empty to use the project type default.">{(p) => <Input {...p} type="number" min={0} max={20} value={v.revisionLimit} onChange={set("revisionLimit")} />}</Field>
      <label className="flex items-start gap-3 sm:col-span-2"><input type="checkbox" checked={v.clientVisible} onChange={(e) => setV({ ...v, clientVisible: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--accent)]" /><span className="text-sm"><b>Show in the client portal now</b><span className="block text-muted">Otherwise the client sees it once a quote is sent.</span></span></label>
      <div className="sm:col-span-2"><Button type="submit" size="lg" loading={go.pending} disabled={!v.clientId || v.name.trim().length < 2}>Create project</Button></div>
    </form>
  );
}
