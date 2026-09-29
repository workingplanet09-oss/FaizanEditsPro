"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { fromMinor } from "@/lib/money";
import { SERVICE_ICONS, type FieldDef } from "@/lib/cms-resources";

export interface ResourceLite {
  key: string;
  label: string;
  singular: string;
  description: string;
  titleField: string;
  subtitleField?: string;
  flagField?: string;
  sortable?: boolean;
  allowCreate?: boolean;
  allowDelete?: boolean;
  allowDuplicate?: boolean;
  fields: FieldDef[];
  defaults?: Record<string, unknown>;
}
type Row = Record<string, any> & { id: string; _href?: string | null };

const isOn = (row: Row, flag?: string) => (!flag ? null : typeof row[flag] === "boolean" ? row[flag] : row[flag] === "PUBLISHED" || row[flag] === "APPROVED" || row[flag] === true);

/** One generic list + editor for every CMS content type, driven by the shared resource definitions. */
export function CmsManager({ resource, items, total, relations, currencyDefault }: { resource: ResourceLite; items: Row[]; total: number; relations: Record<string, { value: string; label: string }[]>; currencyDefault: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  const shown = useMemo(() => (q ? items.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) : items), [items, q]);

  const remove = useAction(async (id: string) => api(`/api/admin/cms/${resource.key}/${id}`, { method: "DELETE" }), { onSuccess: () => (setDel(null), toast.success(`${cap(resource.singular)} deleted`)), onError: (e) => toast.error("Couldn't delete", e.message) });
  const dup = useAction(async (id: string) => api(`/api/admin/cms/${resource.key}/${id}/duplicate`, { body: {} }), { onSuccess: () => toast.success("Duplicated as a draft"), onError: (e) => toast.error("Couldn't duplicate", e.message) });
  const move = useAction(async (ids: string[]) => api(`/api/admin/cms/${resource.key}/reorder`, { body: { ids } }), { onError: (e) => toast.error("Couldn't reorder", e.message) });
  const toggle = useAction(async (row: Row) => {
    const f = resource.flagField!;
    const now = isOn(row, f);
    const value = typeof row[f] === "boolean" ? !now : now ? "DRAFT" : "PUBLISHED";
    return api(`/api/admin/cms/${resource.key}/${row.id}`, { method: "PATCH", body: { [f]: value } });
  }, { onSuccess: () => toast.success("Updated"), onError: (e) => toast.error("Couldn't update", e.message) });

  const swap = (i: number, dir: -1 | 1) => {
    const ids = items.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void move.run(ids);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Filter ${resource.label}`} placeholder={`Filter ${resource.label.toLowerCase()}…`} className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" /></div>
        <span className="text-xs text-subtle">{total} total</span>
        {resource.allowCreate !== false ? <Button className="ml-auto" icon="plus" variant="dark" onClick={() => setEditing("new")}>Add {resource.singular}</Button> : null}
      </div>
      {!shown.length ? (
        <Card><EmptyState icon="news" title={q ? "Nothing matches" : `No ${resource.label.toLowerCase()} yet`} description={q ? "Try a different search." : resource.description} action={!q && resource.allowCreate !== false ? <Button onClick={() => setEditing("new")}>Add {resource.singular}</Button> : undefined} /></Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
          {shown.map((r, i) => {
            const on = isOn(r, resource.flagField);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                {resource.sortable && !q ? (
                  <span className="flex flex-col"><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => swap(i, -1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-up" size={14} /></button><button type="button" aria-label="Move down" disabled={i === shown.length - 1} onClick={() => swap(i, 1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-down" size={14} /></button></span>
                ) : null}
                <div className="min-w-0 flex-1 basis-56">
                  <button type="button" onClick={() => setEditing(r)} className="block max-w-full truncate text-left text-sm font-bold hover:text-accent-text hover:underline">{String(r[resource.titleField] ?? "Untitled")}</button>
                  {resource.subtitleField && r[resource.subtitleField] ? <div className="truncate text-xs text-muted">{String(r[resource.subtitleField]).slice(0, 120)}</div> : null}
                </div>
                {r.isDemo ? <Badge tone="warning" dot={false} icon={false}>Sample</Badge> : null}
                {resource.flagField ? (
                  <button type="button" onClick={() => void toggle.run(r)} aria-label={on ? "Unpublish" : "Publish"} title={on ? "Click to unpublish" : "Click to publish"}><Badge tone={on ? "success" : "neutral"}>{on ? (resource.flagField === "enabled" ? "On" : "Published") : "Draft"}</Badge></button>
                ) : null}
                <div className="flex items-center gap-1">
                  {r._href ? <a href={r._href} target="_blank" rel="noreferrer" aria-label="View on the website" className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="external" size={15} /></a> : null}
                  <button type="button" aria-label={`Edit ${r[resource.titleField]}`} onClick={() => setEditing(r)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="pencil" size={15} /></button>
                  {resource.allowDuplicate ? <button type="button" aria-label="Duplicate" onClick={() => void dup.run(r.id)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"><Icon name="copy" size={15} /></button> : null}
                  {resource.allowDelete !== false ? <button type="button" aria-label="Delete" onClick={() => setDel(r)} className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? <Editor key={editing === "new" ? "new" : editing.id} resource={resource} row={editing === "new" ? null : editing} relations={relations} currencyDefault={currencyDefault} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), router.refresh())} /> : null}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} tone="danger" loading={remove.pending} title={`Delete this ${resource.singular}?`} description={del ? `“${del[resource.titleField]}” will be removed from the site. This can't be undone.` : undefined} confirmLabel="Delete" onConfirm={() => { if (del) void remove.run(del.id); }} />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ───────────────────────── editor ─────────────────────────

function initialValue(f: FieldDef, row: Row | null, resource: ResourceLite, currency: string) {
  const raw = row ? row[f.key] : resource.defaults?.[f.key];
  switch (f.type) {
    case "boolean":
      return !!raw;
    case "money":
      return raw == null ? "" : String(fromMinor(Number(raw), row?.currency ?? currency));
    case "lines":
      return Array.isArray(raw) ? raw.join("\n") : "";
    case "tags":
      return Array.isArray(raw) ? raw.join(", ") : "";
    case "datetime":
      return raw ? new Date(raw).toISOString().slice(0, 16) : "";
    case "metrics":
      return Object.entries((raw as Record<string, string>) ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    case "number":
      return raw == null ? "" : String(raw);
    default:
      return raw ?? "";
  }
}

function toPayload(f: FieldDef, v: any) {
  switch (f.type) {
    case "metrics": {
      const o: Record<string, string> = {};
      String(v || "").split("\n").forEach((l) => {
        const i = l.indexOf(":");
        if (i > 0 && l.slice(i + 1).trim()) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
      return o;
    }
    case "lines":
      return String(v || "").split("\n");
    case "tags":
      return String(v || "").split(",");
    case "datetime":
      return v ? new Date(v).toISOString() : null;
    default:
      return v;
  }
}

function Editor({ resource, row, relations, currencyDefault, onClose, onSaved }: { resource: ResourceLite; row: Row | null; relations: Record<string, { value: string; label: string }[]>; currencyDefault: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, any>>(() => Object.fromEntries(resource.fields.map((f) => [f.key, initialValue(f, row, resource, currencyDefault)])));
  const set = (k: string, v: any) => setVals((p) => ({ ...p, [k]: v }));
  const save = useAction(
    async () => {
      const body = Object.fromEntries(resource.fields.filter((f) => !(row && f.readOnlyOnEdit)).map((f) => [f.key, toPayload(f, vals[f.key])]));
      return row ? api(`/api/admin/cms/${resource.key}/${row.id}`, { method: "PATCH", body }) : api(`/api/admin/cms/${resource.key}`, { body });
    },
    { refresh: false, onSuccess: () => (toast.success(row ? "Saved" : `${cap(resource.singular)} created`), onSaved()), onError: (e) => e.fields && Object.keys(e.fields).length ? undefined : toast.error("Couldn't save", e.message) },
  );
  const groups = [...new Set(resource.fields.map((f) => f.group ?? "Details"))];
  return (
    <Modal open onClose={onClose} size="xl" title={row ? `Edit ${resource.singular}` : `New ${resource.singular}`} description={resource.description}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.pending} onClick={() => void save.run()}>{row ? "Save changes" : `Create ${resource.singular}`}</Button></>}>
      <div className="space-y-8">
        {save.error && !Object.keys(save.fields).length ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{save.error}</p> : null}
        {Object.keys(save.fields).length ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">Please fix the highlighted fields.</p> : null}
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-subtle">{g}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {resource.fields.filter((f) => (f.group ?? "Details") === g).map((f) => (
                <div key={f.key} className={cn(!f.half && "sm:col-span-2")}>
                  <FieldEditor f={f} value={vals[f.key]} onChange={(v) => set(f.key, v)} error={save.fields[f.key]} relations={relations} locked={!!row && !!f.readOnlyOnEdit} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function FieldEditor({ f, value, onChange, error, relations, locked }: { f: FieldDef; value: any; onChange: (v: any) => void; error?: string; relations: Record<string, { value: string; label: string }[]>; locked: boolean }) {
  if (f.type === "boolean") return <Switch checked={!!value} onChange={onChange} label={f.label} description={f.help} />;
  const common = { label: f.label, required: f.required, hint: f.help, error };
  return (
    <Field {...common}>
      {(p) => {
        switch (f.type) {
          case "textarea":
          case "lines":
          case "tasklist":
          case "deliverables":
          case "metrics":
            return <Textarea {...p} rows={f.type === "textarea" ? 3 : 4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? (f.type === "metrics" ? "Avg. watch time: +38%\nTurnaround: 3 days" : undefined)} className={f.type === "tasklist" || f.type === "metrics" ? "font-mono text-[13px]" : undefined} />;
          case "markdown":
            return <Textarea {...p} rows={10} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px]" placeholder="Markdown supported: ## headings, **bold**, lists, links" />;
          case "select":
            return <Select {...p} value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
          case "relation":
            return <Select {...p} value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{(relations[f.relation ?? ""] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
          case "icon":
            return <Select {...p} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{SERVICE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</Select>;
          case "datetime":
            return <Input {...p} type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
          case "number":
          case "money":
            return <Input {...p} inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
          case "url":
          case "image":
            return <Input {...p} type="url" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "https://"} />;
          default:
            return <Input {...p} disabled={locked} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
        }
      }}
    </Field>
  );
}
