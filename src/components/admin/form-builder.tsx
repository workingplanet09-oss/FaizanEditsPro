"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Switch } from "@/components/ui/form";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import type { FormDef, Logic, QuestionDef } from "@/lib/conditions";

const TYPES = ["TEXT", "TEXTAREA", "SELECT", "MULTI_SELECT", "RADIO", "CHECKBOX", "DATE", "TIME", "NUMBER", "CURRENCY", "FILE", "URL", "EMAIL", "PHONE", "COLOR", "RATING"];
const OPTION_TYPES = ["SELECT", "MULTI_SELECT", "RADIO"];
const OPS = [["eq", "is"], ["neq", "is not"], ["in", "is one of"], ["nin", "is none of"], ["contains", "contains"], ["not_contains", "doesn't contain"], ["exists", "is answered"], ["empty", "is empty"], ["gt", "greater than"], ["lt", "less than"], ["truthy", "is yes / checked"]] as const;
const NO_VALUE = new Set(["exists", "empty", "truthy"]);

interface Cat { key: string; name: string }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);

function describeLogic(l: Logic | null | undefined, all: QuestionDef[]) {
  if (!l) return null;
  const conds = [...(l.all ?? []).map((c) => ({ c, j: "and" })), ...(l.any ?? []).map((c) => ({ c, j: "or" }))];
  if (!conds.length) return null;
  return conds.map(({ c }) => `${all.find((q) => q.key === c.field)?.text ?? c.field} ${OPS.find((o) => o[0] === c.op)?.[1]} ${NO_VALUE.has(c.op) ? "" : Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}`).join(l.any?.length && !l.all?.length ? " OR " : " AND ");
}

export function FormBuilder({ form, forms, categories, activeSection }: { form: FormDef & { sections: (FormDef["sections"][number] & { questions: (QuestionDef & { active?: boolean })[] })[] }; forms: { key: string; name: string }[]; categories: Cat[]; activeSection: string }) {
  const toast = useToast();
  const [editing, setEditing] = useState<(QuestionDef & { active?: boolean }) | "new" | null>(null);
  const [del, setDel] = useState<QuestionDef | null>(null);
  const section = form.sections.find((s) => s.key === activeSection) ?? form.sections[0];
  const all = form.sections.flatMap((s) => s.questions);
  const mv = useAction(async (ids: string[]) => api("/api/admin/forms/questions/reorder", { body: { ids } }), { onError: (e) => toast.error("Couldn't reorder", e.message) });
  const tog = useAction(async (q: QuestionDef & { active?: boolean }) => api(`/api/admin/forms/questions/${q.id}`, { method: "PATCH", body: { active: q.active === false } }), { onError: (e) => toast.error("Couldn't update", e.message) });
  const dup = useAction(async (id: string) => api(`/api/admin/forms/questions/${id}/duplicate`, { body: {} }), { onSuccess: () => toast.success("Duplicated (disabled until you review it)") });
  const remove = useAction(async (id: string) => api(`/api/admin/forms/questions/${id}`, { method: "DELETE" }), { onSuccess: () => (setDel(null), toast.success("Question deleted")), onError: (e) => toast.error("Couldn't delete", e.message) });
  const swap = (i: number, d: -1 | 1) => {
    const ids = section.questions.map((q) => q.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void mv.run(ids);
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Sections" className="space-y-1">
        <div className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
          {forms.map((f) => <a key={f.key} href={`/admin/forms?form=${f.key}`} aria-current={f.key === form.key ? "page" : undefined} className={cn("flex-1 rounded-lg px-2 py-1.5 text-center", f.key === form.key ? "bg-surface shadow-soft" : "text-muted")}>{f.key === "inquiry" ? "Inquiry" : "Project brief"}</a>)}
        </div>
        {form.sections.map((s) => (
          <a key={s.key} href={`/admin/forms?form=${form.key}&section=${s.key}`} aria-current={s.key === section?.key ? "page" : undefined} className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition", s.key === section?.key ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            <span className="truncate">{s.title}</span><span className={cn("rounded-full px-1.5 text-[11px]", s.key === section?.key ? "bg-white/15" : "bg-surface-2")}>{s.questions.length}</span>
          </a>
        ))}
        <a href="/start-project" target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-muted hover:text-fg"><Icon name="eye" size={15} />Preview as visitor</a>
      </nav>

      <div>
        {section ? (
          <Card>
            <CardHeader title={section.title} description={section.description ?? undefined} action={<Button size="sm" icon="plus" onClick={() => setEditing("new")}>Add question</Button>} />
            {section.questions.length ? (
              <ul className="divide-y divide-line">
                {section.questions.map((q, i) => {
                  const logic = describeLogic(q.conditionalLogic, all);
                  return (
                    <li key={q.id} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3.5", q.active === false && "opacity-60")}>
                      <span className="flex flex-col pt-0.5"><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => swap(i, -1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-up" size={14} /></button><button type="button" aria-label="Move down" disabled={i === section.questions.length - 1} onClick={() => swap(i, 1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-down" size={14} /></button></span>
                      <div className="min-w-0 flex-1 basis-64">
                        <button type="button" onClick={() => setEditing(q)} className="text-left text-sm font-bold hover:text-accent-text hover:underline">{q.text}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <Badge tone="neutral" dot={false} icon={false}>{q.type.toLowerCase().replace("_", " ")}</Badge>
                          {q.required ? <Badge tone="danger" dot={false} icon={false}>required</Badge> : null}
                          {q.categoryKeys.filter((c) => c !== "COMMON").map((c) => <Badge key={c} tone="accent" dot={false} icon={false}>{c.toLowerCase().replace(/_/g, " ")}</Badge>)}
                          <span className="font-mono text-subtle">{q.key}</span>
                        </div>
                        {logic ? <p className="mt-1.5 text-xs text-muted"><Icon name="workflow" size={11} className="mr-1 inline" />Shown when: {logic}</p> : null}
                        {q.options.some((o) => o.categoryKeys?.length) ? <p className="mt-1 text-xs text-muted">Selecting {q.options.filter((o) => o.categoryKeys?.length).map((o) => o.label).slice(0, 4).join(", ")} adds extra questions.</p> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={q.active !== false} onChange={() => void tog.run(q)} label={<span className="sr-only">Enabled</span>} />
                        <button type="button" aria-label={`Edit ${q.text}`} onClick={() => setEditing(q)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="pencil" size={15} /></button>
                        <button type="button" aria-label="Duplicate" onClick={() => void dup.run(q.id)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="copy" size={15} /></button>
                        <button type="button" aria-label="Delete" onClick={() => setDel(q)} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState icon="clipboard" title="No questions in this section" description="Add one to start." />}
          </Card>
        ) : null}
      </div>

      {editing && section ? <QuestionEditor key={editing === "new" ? "new" : editing.id} q={editing === "new" ? null : editing} formKey={form.key} sectionKey={section.key} sections={form.sections} categories={categories} all={all} onClose={() => setEditing(null)} /> : null}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} tone="danger" loading={remove.pending} title="Delete this question?" description={del ? `“${del.text}” will be removed. Answers already collected are kept on existing leads and projects.` : undefined} confirmLabel="Delete question" onConfirm={() => { if (del) void remove.run(del.id); }} />
    </div>
  );
}

function QuestionEditor({ q, formKey, sectionKey, sections, categories, all, onClose }: { q: (QuestionDef & { active?: boolean }) | null; formKey: string; sectionKey: string; sections: { key: string; title: string }[]; categories: Cat[]; all: QuestionDef[]; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    text: q?.text ?? "",
    key: q?.key ?? "",
    type: q?.type ?? "TEXT",
    sectionKey: q?.sectionKey ?? sectionKey,
    helpText: q?.helpText ?? "",
    placeholder: q?.placeholder ?? "",
    required: q?.required ?? false,
    active: q?.active !== false,
    categoryKeys: (q?.categoryKeys ?? ["COMMON"]) as string[],
  });
  const [opts, setOpts] = useState((q?.options ?? []).map((o) => ({ label: o.label, value: o.value, categoryKeys: (o.categoryKeys ?? []) as string[], description: o.description ?? "" })));
  const [mode, setMode] = useState<"all" | "any">(q?.conditionalLogic?.any?.length && !q?.conditionalLogic?.all?.length ? "any" : "all");
  const [conds, setConds] = useState<{ field: string; op: string; value: string }[]>(((q?.conditionalLogic?.all ?? q?.conditionalLogic?.any ?? []) as any[]).map((c) => ({ field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "") })));
  const save = useAction(
    async () => {
      const logic = conds.length ? { [mode]: conds.map((c) => ({ field: c.field, op: c.op, ...(NO_VALUE.has(c.op) ? {} : { value: ["in", "nin"].includes(c.op) ? c.value.split(",").map((s) => s.trim()).filter(Boolean) : c.value }) })) } : null;
      const body: any = { formKey, sectionKey: v.sectionKey, key: v.key || slug(v.text), text: v.text, helpText: v.helpText || null, placeholder: v.placeholder || null, type: v.type, required: v.required, active: v.active, categoryKeys: v.categoryKeys, conditionalLogic: logic, ...(OPTION_TYPES.includes(v.type) ? { options: opts.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), value: o.value.trim() || slug(o.label), categoryKeys: o.categoryKeys, description: o.description || null })) } : {}) };
      if (q) delete body.formKey;
      return q ? api(`/api/admin/forms/questions/${q.id}`, { method: "PATCH", body }) : api("/api/admin/forms/questions", { body });
    },
    { onSuccess: () => (toast.success(q ? "Question saved" : "Question added"), onClose()), onError: (e) => (Object.keys(e.fields ?? {}).length ? undefined : toast.error("Couldn't save", e.message)) },
  );
  const others = all.filter((x) => x.key !== q?.key);
  return (
    <Modal open onClose={onClose} size="xl" title={q ? "Edit question" : "Add question"} description="Changes apply to new submissions immediately. Existing answers are never altered."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.pending} disabled={v.text.trim().length < 3} onClick={() => void save.run()}>{q ? "Save changes" : "Add question"}</Button></>}>
      <div className="space-y-7">
        {save.error && !Object.keys(save.fields).length ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{save.error}</p> : null}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Question" required className="sm:col-span-2" error={save.fields.text}>{(p) => <Input {...p} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value, key: q ? v.key : slug(e.target.value) })} />}</Field>
          <Field label="Answer type" optional={false}>{(p) => <Select {...p} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as QuestionDef["type"] })}>{TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase().replace("_", " ")}</option>)}</Select>}</Field>
          <Field label="Section" optional={false}>{(p) => <Select {...p} value={v.sectionKey} onChange={(e) => setV({ ...v, sectionKey: e.target.value })}>{sections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}</Select>}</Field>
          <Field label="Field key" optional={false} hint="Stable ID used in automations and scoring. Lowercase with underscores." error={save.fields.key}>{(p) => <Input {...p} className="font-mono" value={v.key} disabled={!!q} onChange={(e) => setV({ ...v, key: slug(e.target.value) })} />}</Field>
          <Field label="Placeholder">{(p) => <Input {...p} value={v.placeholder} onChange={(e) => setV({ ...v, placeholder: e.target.value })} />}</Field>
          <Field label="Help text" className="sm:col-span-2">{(p) => <Input {...p} value={v.helpText} onChange={(e) => setV({ ...v, helpText: e.target.value })} />}</Field>
          <div className="flex flex-wrap gap-6 sm:col-span-2"><Switch checked={v.required} onChange={(x) => setV({ ...v, required: x })} label="Required" /><Switch checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Enabled" /></div>
        </section>

        {OPTION_TYPES.includes(v.type) ? (
          <section>
            <h3 className="mb-1 text-sm font-extrabold">Options</h3>
            <p className="mb-3 text-xs text-muted">Choose which extra question groups an option unlocks — that's how "Real estate" adds property questions.</p>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input aria-label="Option label" placeholder="Label" value={o.label} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: e.target.value, value: x.value && slug(x.label) !== x.value ? x.value : slug(e.target.value) } : x)))} />
                  <Input aria-label="Option value" className="font-mono" placeholder="value" value={o.value} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, value: slug(e.target.value) } : x)))} />
                  <select aria-label="Adds question group" value={o.categoryKeys[0] ?? ""} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, categoryKeys: e.target.value ? [e.target.value] : [] } : x)))} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm"><option value="">Adds no group</option>{categories.filter((c) => c.key !== "COMMON").map((c) => <option key={c.key} value={c.key}>Adds: {c.name}</option>)}</select>
                  <button type="button" aria-label="Remove option" onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button>
                </div>
              ))}
              <Button size="sm" variant="outline" icon="plus" onClick={() => setOpts([...opts, { label: "", value: "", categoryKeys: [], description: "" }])}>Add option</Button>
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-sm font-extrabold">Show this question only when…</h3>
          <p className="mb-3 text-xs text-muted">Leave empty to always show it (when its question group is active).</p>
          {conds.length > 1 ? <div className="mb-3 flex items-center gap-2 text-sm">Match <select aria-label="Match mode" value={mode} onChange={(e) => setMode(e.target.value as "all" | "any")} className="h-9 rounded-lg border border-line-strong bg-surface px-2 font-semibold"><option value="all">all conditions</option><option value="any">any condition</option></select></div> : null}
          <div className="space-y-2">
            {conds.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]">
                <select aria-label="Question" value={c.field} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm"><option value="">Choose question…</option>{others.map((o) => <option key={o.key} value={o.key}>{o.text.slice(0, 60)}</option>)}</select>
                <select aria-label="Operator" value={c.op} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm">{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {NO_VALUE.has(c.op) ? <span /> : <Input aria-label="Value" placeholder={["in", "nin"].includes(c.op) ? "a, b, c" : "value"} value={c.value} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                <button type="button" aria-label="Remove condition" onClick={() => setConds(conds.filter((_, j) => j !== i))} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button>
              </div>
            ))}
            {conds.length < 10 ? <Button size="sm" variant="outline" icon="plus" onClick={() => setConds([...conds, { field: "", op: "eq", value: "" }])}>Add condition</Button> : null}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-extrabold">Question group</h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {categories.map((c) => <Checkbox key={c.key} checked={v.categoryKeys.includes(c.key)} onChange={(e) => setV({ ...v, categoryKeys: e.target.checked ? [...v.categoryKeys, c.key] : v.categoryKeys.filter((k) => k !== c.key) })} label={c.name} />)}
          </div>
          <p className="mt-2 text-xs text-muted">The question appears only when at least one of its groups is active. “Common” is always active.</p>
        </section>
      </div>
    </Modal>
  );
}
