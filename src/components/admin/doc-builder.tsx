"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";
import { computeTotals, formatMoney, fromMinor, toMinor } from "@/lib/money";
import { DocLines } from "@/components/portal/doc-lines";

interface Line { description: string; quantity: string; price: string; serviceId?: string | null }
export interface BuilderInitial { id?: string; clientId?: string; projectId?: string; leadId?: string; currency: string; items?: { description: string; quantity: number; unitPrice: number; serviceId?: string | null }[]; discount?: number; taxRateBps?: number; depositPercent?: number; validUntil?: string; dueDate?: string; notes?: string; terms?: string; title?: string; kind?: string }

/** Shared line-item builder for quotes and invoices, with a live totals preview computed by the same function the server uses. */
export function DocBuilder({ mode, clients, projects, services, currencies, initial, defaults }: { mode: "quote" | "invoice"; clients: { id: string; label: string }[]; projects: { id: string; label: string; clientId: string }[]; services: { id: string; label: string; price: number | null }[]; currencies: string[]; initial: BuilderInitial; defaults: { taxRateBps: number; depositPercent: number; validDays: number; terms: string; dueDays: number } }) {
  const router = useRouter();
  const toast = useToast();
  const editing = !!initial.id;
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [currency, setCurrency] = useState(initial.currency);
  const [title, setTitle] = useState(initial.title ?? "");
  const [kind, setKind] = useState(initial.kind ?? "OTHER");
  const [lines, setLines] = useState<Line[]>(initial.items?.length ? initial.items.map((i) => ({ description: i.description, quantity: String(i.quantity), price: String(fromMinor(i.unitPrice, initial.currency)), serviceId: i.serviceId })) : [{ description: "", quantity: "1", price: "" }]);
  const [discount, setDiscount] = useState(initial.discount ? String(fromMinor(initial.discount, initial.currency)) : "");
  const [tax, setTax] = useState(String((initial.taxRateBps ?? defaults.taxRateBps) / 100));
  const [deposit, setDeposit] = useState(String(initial.depositPercent ?? defaults.depositPercent));
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? new Date(Date.now() + defaults.validDays * 86400000).toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial.dueDate ?? new Date(Date.now() + defaults.dueDays * 86400000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [terms, setTerms] = useState(initial.terms ?? defaults.terms);

  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity) || 0, unitPrice: toMinor(Number(l.price) || 0, currency), serviceId: l.serviceId ?? null }));
  const valid = parsed.filter((l) => l.description && l.quantity > 0);
  const totals = useMemo(() => computeTotals(valid, { discount: toMinor(Number(discount) || 0, currency), taxRateBps: Math.round((Number(tax) || 0) * 100), depositPercent: mode === "quote" ? Number(deposit) : 100 }), [valid, discount, tax, deposit, currency, mode]);
  const clientProjects = projects.filter((p) => p.clientId === clientId);

  const save = useAction(
    async (send: boolean) => {
      const common = { items: valid, discount: toMinor(Number(discount) || 0, currency), taxRateBps: Math.round((Number(tax) || 0) * 100), notes: notes || null };
      if (mode === "quote") {
        const body = { ...common, title: title || undefined, currency, depositPercent: Number(deposit), validUntil: validUntil || null, terms: terms || null };
        const q = editing ? await api<{ id: string }>(`/api/quotes/${initial.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/api/quotes", { body: { ...body, clientId, projectId: projectId || null, leadId: initial.leadId ?? null } });
        if (send) await api(`/api/quotes/${q.id}/send`, { body: {} });
        return { id: q.id, sent: send };
      }
      const inv = await api<{ id: string }>("/api/invoices", { body: { ...common, clientId, projectId: projectId || null, kind, currency, dueDate: dueDate || null, send } });
      return { id: inv.id, sent: send };
    },
    { refresh: false, onSuccess: (r) => (toast.success(r.sent ? `${mode === "quote" ? "Quote" : "Invoice"} sent to the client` : "Saved as draft"), router.push(`/admin/${mode}s/${r.id}`)), onError: (e) => toast.error("Couldn't save", e.message) },
  );

  const set = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const canSave = !!clientId && valid.length > 0;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_26rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={mode === "quote" ? "Quote details" : "Invoice details"} />
          <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2">
            <Field label="Client" required className="sm:col-span-2">{(p) => <Select {...p} disabled={editing} value={clientId} onChange={(e) => (setClientId(e.target.value), setProjectId(""))}><option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
            <Field label="Project" hint={mode === "quote" ? "Leave empty to create a project when the quote is accepted." : undefined}>{(p) => <Select {...p} disabled={editing} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">{mode === "quote" ? "New project (auto)" : "— none —"}</option>{clientProjects.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
            <Field label="Currency" optional={false}>{(p) => <Select {...p} disabled={editing} value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
            {mode === "quote" ? <Field label="Title" className="sm:col-span-2">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Autumn campaign — 6 shorts" />}</Field> : <Field label="Type" optional={false}>{(p) => <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}><option value="OTHER">One-off</option><option value="DEPOSIT">Deposit</option><option value="BALANCE">Balance</option><option value="FULL">Full payment</option><option value="RETAINER">Retainer</option><option value="CHANGE_ORDER">Change order</option></Select>}</Field>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Line items" description="Prices are in the document currency." />
          <div className="space-y-3 px-5 pb-5">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2 max-sm:grid-cols-2">
                <Field label={i === 0 ? "Description" : undefined} optional={false} className="max-sm:col-span-2">{(p) => <Input {...p} aria-label="Description" list={mode === "quote" ? "svc-list" : undefined} value={l.description} onChange={(e) => { set(i, "description", e.target.value); const s = services.find((x) => x.label === e.target.value); if (s?.price && !l.price) set(i, "price", String(fromMinor(s.price, currency))); }} placeholder="e.g. YouTube video edit (up to 10 min)" />}</Field>
                <Field label={i === 0 ? "Qty" : undefined} optional={false}>{(p) => <Input {...p} aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, "quantity", e.target.value)} />}</Field>
                <Field label={i === 0 ? "Unit price" : undefined} optional={false}>{(p) => <Input {...p} aria-label="Unit price" inputMode="decimal" value={l.price} onChange={(e) => set(i, "price", e.target.value)} placeholder="0.00" />}</Field>
                <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="mb-1 rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-30"><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <datalist id="svc-list">{services.map((s) => <option key={s.id} value={s.label} />)}</datalist>
            <Button variant="outline" size="sm" icon="plus" onClick={() => setLines([...lines, { description: "", quantity: "1", price: "" }])}>Add line</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Pricing & terms" />
          <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">
            <Field label="Discount" optional={false}>{(p) => <Input {...p} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />}</Field>
            <Field label="Tax rate (%)" optional={false}>{(p) => <Input {...p} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />}</Field>
            {mode === "quote" ? <Field label="Deposit (%)" optional={false} hint="Paid before work starts; the rest is billed on approval.">{(p) => <Input {...p} type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(e.target.value)} />}</Field> : <Field label="Due date" optional={false}>{(p) => <Input {...p} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>}
            {mode === "quote" ? <Field label="Valid until" optional={false}>{(p) => <Input {...p} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />}</Field> : null}
            <Field label="Notes to the client" className="sm:col-span-3">{(p) => <Textarea {...p} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
            {mode === "quote" ? <Field label="Terms" className="sm:col-span-3">{(p) => <Textarea {...p} rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />}</Field> : null}
          </div>
        </Card>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="p-5">
          <h3 className="mb-4 text-base font-extrabold">Preview</h3>
          {valid.length ? <DocLines items={valid.map((l) => ({ ...l, amount: Math.round(l.quantity * l.unitPrice) }))} currency={currency} subtotal={totals.subtotal} discount={totals.discount} tax={totals.tax} taxRateBps={Math.round((Number(tax) || 0) * 100)} total={totals.total} deposit={mode === "quote" ? totals.deposit : undefined} balance={mode === "quote" ? totals.balance : undefined} depositPercent={mode === "quote" ? Number(deposit) : undefined} /> : <p className="text-sm text-muted">Add a line item to see totals.</p>}
        </Card>
        <Card className="space-y-3 p-5">
          {save.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{save.error}</p> : null}
          <Button size="lg" className="w-full" icon="send" loading={save.pending} disabled={!canSave} onClick={() => void save.run(true)}>{editing ? "Save & send" : "Send to client"}</Button>
          <Button size="lg" className="w-full" variant="outline" loading={save.pending} disabled={!canSave} onClick={() => void save.run(false)}>Save as draft</Button>
          <p className="text-center text-xs text-subtle">Total {formatMoney(totals.total, currency)}{mode === "quote" && totals.balance > 0 ? ` · deposit ${formatMoney(totals.deposit, currency)}` : ""}</p>
        </Card>
      </aside>
    </div>
  );
}
