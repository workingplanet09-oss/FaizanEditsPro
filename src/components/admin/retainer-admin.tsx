"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { toMinor } from "@/lib/money";

export function NewRetainer({ clients, currencies, defaultCurrency, plans }: { clients: { id: string; label: string }[]; currencies: string[]; defaultCurrency: string; plans: { id: string; name: string; price: number | null; videos: number | null; shorts: number | null; hours: number | null; revisions: number | null }[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ clientId: "", planId: "", name: "", price: "", currency: defaultCurrency, videos: "0", shorts: "0", hours: "0", turnaround: "3", revisions: "2", notes: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const create = useAction(async () => api("/api/retainers", { body: { clientId: v.clientId, planId: v.planId || null, name: v.name, monthlyPrice: toMinor(Number(v.price) || 0, v.currency), currency: v.currency, videosIncluded: Number(v.videos), shortsIncluded: Number(v.shorts), hoursIncluded: Number(v.hours), turnaroundDays: Number(v.turnaround), revisionsIncluded: Number(v.revisions), notes: v.notes || null } }), { onSuccess: () => (setOpen(false), toast.success("Retainer created")), onError: (e) => toast.error("Couldn't create", e.message) });
  const pickPlan = (id: string) => {
    const p = plans.find((x) => x.id === id);
    setV({ ...v, planId: id, ...(p ? { name: v.name || p.name, price: p.price ? String(p.price / 100) : v.price, videos: String(p.videos ?? 0), shorts: String(p.shorts ?? 0), hours: String(p.hours ?? 0), revisions: String(p.revisions ?? 2) } : {}) });
  };
  return (
    <>
      <Button icon="plus" variant="dark" onClick={() => setOpen(true)}>New retainer</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="New retainer" description="A monthly allowance billed automatically each period." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} disabled={!v.clientId || v.name.trim().length < 2} onClick={() => void create.run()}>Create retainer</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {create.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{create.error}</p> : null}
          <Field label="Client" required className="sm:col-span-2">{(p) => <Select {...p} value={v.clientId} onChange={set("clientId")}><option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
          {plans.length ? <Field label="Start from a plan" className="sm:col-span-2">{(p) => <Select {...p} value={v.planId} onChange={(e) => pickPlan(e.target.value)}><option value="">Custom</option>{plans.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field> : null}
          <Field label="Name" required>{(p) => <Input {...p} value={v.name} onChange={set("name")} placeholder="Creator Growth — monthly" />}</Field>
          <Field label="Monthly price" required>{(p) => <Input {...p} inputMode="decimal" value={v.price} onChange={set("price")} />}</Field>
          <Field label="Currency" optional={false}>{(p) => <Select {...p} value={v.currency} onChange={set("currency")}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
          <Field label="Turnaround (days)" optional={false}>{(p) => <Input {...p} type="number" min={1} value={v.turnaround} onChange={set("turnaround")} />}</Field>
          <Field label="Videos / month" optional={false}>{(p) => <Input {...p} type="number" min={0} value={v.videos} onChange={set("videos")} />}</Field>
          <Field label="Shorts / month" optional={false}>{(p) => <Input {...p} type="number" min={0} value={v.shorts} onChange={set("shorts")} />}</Field>
          <Field label="Hours / month" optional={false}>{(p) => <Input {...p} type="number" min={0} value={v.hours} onChange={set("hours")} />}</Field>
          <Field label="Revisions per video" optional={false}>{(p) => <Input {...p} type="number" min={0} value={v.revisions} onChange={set("revisions")} />}</Field>
          <Field label="Notes" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={v.notes} onChange={set("notes")} />}</Field>
        </div>
      </Modal>
    </>
  );
}

export function RetainerStatus({ id, status }: { id: string; status: string }) {
  const toast = useToast();
  const set = useAction(async (s: string) => api(`/api/retainers/${id}`, { method: "PATCH", body: { status: s } }), { onSuccess: () => toast.success("Retainer updated"), onError: (e) => toast.error("Couldn't update", e.message) });
  return (
    <select aria-label="Retainer status" value={status} onChange={(e) => void set.run(e.target.value)} className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-semibold">
      {["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
    </select>
  );
}
