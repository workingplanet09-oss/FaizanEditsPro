"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Card, CardHeader } from "@/components/ui/primitives";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";

export function InvoiceActions({ id, status, due, currency, canWrite, canPay }: { id: string; status: string; due: number; currency: string; canWrite: boolean; canPay: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(fromMinor(due, currency)));
  const [method, setMethod] = useState("Bank transfer");
  const [ref, setRef] = useState("");
  const pay = useAction(async () => api(`/api/invoices/${id}/manual-payment`, { body: { amount: toMinor(Number(amount), currency), method, reference: ref || undefined } }), { onSuccess: () => (setOpen(false), toast.success("Payment recorded")), onError: (e) => toast.error("Couldn't record payment", e.message) });
  const payable = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(status);
  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && status === "DRAFT" ? <ActionButton url={`/api/invoices/${id}/send`} icon="send" success="Invoice sent to the client">Send invoice</ActionButton> : null}
      {canWrite && payable ? <ActionButton url={`/api/invoices/${id}/send`} variant="outline" icon="mail" success="Reminder sent">Resend</ActionButton> : null}
      {canPay && payable ? <Button variant="outline" icon="wallet" onClick={() => setOpen(true)}>Record payment</Button> : null}
      {canWrite && !["PAID", "CANCELLED"].includes(status) ? <ActionButton url={`/api/invoices/${id}/cancel`} variant="danger" success="Invoice cancelled" confirm={{ title: "Cancel this invoice?", description: "The client will no longer be able to pay it. This is recorded in the audit log.", confirmLabel: "Cancel invoice", tone: "danger" }}>Cancel invoice</ActionButton> : null}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Record an offline payment" description={`Outstanding: ${formatMoney(due, currency)}`} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pay.pending} disabled={!Number(amount)} onClick={() => void pay.run()}>Record payment</Button></>}>
        <div className="space-y-4">
          {pay.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{pay.error}</p> : null}
          <Field label={`Amount (${currency})`} required>{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
          <Field label="Method" required>{(p) => <Input {...p} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer, cash, PayPal…" />}</Field>
          <Field label="Reference">{(p) => <Input {...p} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction ID or note" />}</Field>
        </div>
      </Modal>
    </div>
  );
}

export function ContractEditor({ id, title, sections, editable }: { id: string; title: string; sections: { key: string; title: string; body: string }[]; editable: boolean }) {
  const toast = useToast();
  const [t, setT] = useState(title);
  const [s, setS] = useState(sections);
  const save = useAction(async () => api(`/api/contracts/${id}`, { method: "PATCH", body: { title: t, sections: s } }), { onSuccess: () => toast.success("Contract saved"), onError: (e) => toast.error("Couldn't save", e.message) });
  if (!editable) return null;
  return (
    <Card>
      <CardHeader title="Edit contract" description="Editing creates a new version. If the client already viewed it, they'll be asked to review the update before signing." />
      <div className="space-y-4 px-5 pb-5">
        <Field label="Title" optional={false}>{(p) => <Input {...p} value={t} onChange={(e) => setT(e.target.value)} />}</Field>
        {s.map((sec, i) => (
          <div key={sec.key} className="space-y-2 rounded-xl border border-line p-4">
            <Input aria-label="Section title" value={sec.title} onChange={(e) => setS(s.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="font-bold" />
            <Textarea aria-label={`${sec.title} text`} rows={5} value={sec.body} onChange={(e) => setS(s.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
          </div>
        ))}
        <Button loading={save.pending} onClick={() => void save.run()}>Save new version</Button>
      </div>
    </Card>
  );
}
