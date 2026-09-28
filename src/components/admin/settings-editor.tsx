"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";

/**
 * Schema-less editor for a settings group: it renders controls from the shape of the current value
 * (strings, numbers, switches, lists, repeatable rows, nested groups). The server validates on save with the real schema.
 */
const ENUMS: Record<string, string[]> = { mode: ["auto", "manual", "hidden"] };
const LONG = /(description|intro|story|body|summary|detail|terms|privacy|notes|policy|address|instructions|subheadline|message|bio|youDo|weDo)$/i;
const COLOR_KEYS = /^(accent|accentContrast|color|.*Color)$/;
const pretty = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/\bUrl\b/, "URL").replace(/\bCta\b/, "button").replace(/\bSeo\b/, "SEO").replace(/\bBps\b/, "(basis points)");

type V = any;

function blankLike(sample: V): V {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === "object") return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : typeof v === "object" && v ? blankLike(v) : ""]));
  return typeof sample === "number" ? 0 : typeof sample === "boolean" ? false : "";
}

export function SettingsEditor({ group, value }: { group: string; value: V }) {
  const toast = useToast();
  const [v, setV] = useState<V>(value);
  const save = useAction(async () => api(`/api/admin/settings/${group}`, { method: "PUT", body: v }), { onSuccess: () => toast.success("Settings saved", "The change is live."), onError: (e) => toast.error("Couldn't save", e.message) });
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <div className="space-y-5">
      <ObjectFields value={v} onChange={setV} path={[]} />
      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-bg/90 p-3 shadow-lift backdrop-blur lg:bottom-4">
        {save.error ? <span role="alert" className="mr-auto text-sm font-medium text-danger">{save.error}</span> : dirty ? <span className="mr-auto text-sm text-muted">You have unsaved changes</span> : <span className="mr-auto text-sm text-subtle">All changes saved</span>}
        <Button variant="ghost" disabled={!dirty} onClick={() => setV(value)}>Reset</Button>
        <Button icon="check" loading={save.pending} disabled={!dirty} onClick={() => void save.run()}>Save settings</Button>
      </div>
    </div>
  );
}

function ObjectFields({ value, onChange, path }: { value: Record<string, V>; onChange: (v: Record<string, V>) => void; path: string[] }) {
  return (
    <div className={cn("grid gap-4", path.length === 0 ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
      {Object.entries(value).map(([k, val]) => {
        const set = (nv: V) => onChange({ ...value, [k]: nv });
        return <Node key={k} name={k} value={val} onChange={set} path={[...path, k]} />;
      })}
    </div>
  );
}

function Node({ name, value, onChange, path }: { name: string; value: V; onChange: (v: V) => void; path: string[] }) {
  const label = pretty(name);
  if (typeof value === "boolean") return <div className="sm:col-span-2"><Switch checked={value} onChange={onChange} label={label} /></div>;
  if (typeof value === "number") return <Field label={label} optional={false}>{(p) => <Input {...p} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />}</Field>;
  if (typeof value === "string") {
    if (ENUMS[name]) return <Field label={label} optional={false}>{(p) => <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>{ENUMS[name].map((o) => <option key={o} value={o}>{o}</option>)}</Select>}</Field>;
    if (COLOR_KEYS.test(name) || /^#[0-9a-f]{6}$/i.test(value)) return <Field label={label} optional={false}>{(p) => <div className="flex items-center gap-2"><input type="color" aria-label={`${label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" /><Input {...p} value={value} onChange={(e) => onChange(e.target.value)} className="max-w-36 font-mono" /></div>}</Field>;
    if (LONG.test(name) || value.includes("\n") || value.length > 90) return <Field label={label} optional={false} className="sm:col-span-2">{(p) => <Textarea {...p} rows={Math.min(12, Math.max(3, Math.ceil(value.length / 90)))} value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
    return <Field label={label} optional={false}>{(p) => <Input {...p} value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
  }
  if (Array.isArray(value)) {
    if (!value.length || typeof value[0] !== "object") {
      const isNum = typeof value[0] === "number";
      return <Field label={label} optional={false} hint={isNum ? "Comma-separated numbers (e.g. weekdays 1–5 = Mon–Fri)." : "One per line."} className="sm:col-span-2">{(p) => <Textarea {...p} rows={Math.min(8, Math.max(2, value.length + 1))} value={isNum ? value.join(", ") : value.join("\n")} onChange={(e) => onChange(isNum ? e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) : e.target.value.split("\n"))} />}</Field>;
    }
    const template = blankLike(value[0]);
    return (
      <div className="sm:col-span-2">
        <h4 className="mb-2 text-sm font-extrabold">{label}</h4>
        <div className="space-y-3">
          {value.map((row, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface-2/30 p-4">
              <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-subtle">#{i + 1}</span>
                <span className="flex gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => { const a = [...value]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }} className="rounded p-1 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-up" size={15} /></button>
                  <button type="button" aria-label="Move down" disabled={i === value.length - 1} onClick={() => { const a = [...value]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange(a); }} className="rounded p-1 text-subtle hover:text-fg disabled:opacity-25"><Icon name="chevron-down" size={15} /></button>
                  <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger"><Icon name="trash" size={15} /></button>
                </span>
              </div>
              {typeof row === "object" && row ? <ObjectFields value={row} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} path={[...path, String(i)]} /> : null}
            </div>
          ))}
          <Button size="sm" variant="outline" icon="plus" onClick={() => onChange([...value, structuredClone(template)])}>Add</Button>
        </div>
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-extrabold">{label}</legend>
        <div className="rounded-2xl border border-line p-4"><ObjectFields value={value} onChange={onChange} path={path} /></div>
      </fieldset>
    );
  }
  return null;
}

export function IntegrationCard({ items }: { items: { name: string; ok: boolean; detail: string; env?: string }[] }) {
  return (
    <Card>
      <CardHeader title="Integrations" description="Configured through environment variables so secrets never touch the database." />
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.name} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", i.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}><Icon name={i.ok ? "check" : "alert"} size={15} /></span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold">{i.name}</div><div className="text-xs text-muted">{i.detail}</div></div>
            {i.env ? <code className="rounded bg-surface-2 px-2 py-1 text-[11px] text-muted">{i.env}</code> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
