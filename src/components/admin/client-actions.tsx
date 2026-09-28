"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { CLIENT_STATUS_META } from "@/lib/statuses";

export function ClientToolbar({ client, staff, canWrite }: { client: { id: string; name: string; email: string; phone: string; companyName: string; industry: string; website: string; country: string; status: string; managerId: string | null; hasUser: boolean }; staff: { id: string; name: string }[]; canWrite: boolean }) {
  const toast = useToast();
  const router = useRouter();
  void router;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: client.name, email: client.email, phone: client.phone, companyName: client.companyName, industry: client.industry, website: client.website, country: client.country });
  const patch = useAction(async (body: Record<string, unknown>) => api(`/api/clients/${client.id}`, { method: "PATCH", body }), { onSuccess: () => (setOpen(false), toast.success("Client updated")), onError: (e) => toast.error("Couldn't update", e.message) });
  const invite = useAction(async () => api(`/api/clients/${client.id}/invite`, { body: {} }), { onSuccess: () => toast.success("Portal invitation sent", `An email was sent to ${client.email}.`), onError: (e) => toast.error("Couldn't send invite", e.message) });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="client-status">Client status</label>
        <select id="client-status" disabled={!canWrite} value={client.status} onChange={(e) => void patch.run({ status: e.target.value })} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">
          {Object.entries(CLIENT_STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="client-manager">Account manager</label>
        <select id="client-manager" disabled={!canWrite} value={client.managerId ?? ""} onChange={(e) => void patch.run({ managerId: e.target.value || null })} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">
          <option value="">No account manager</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {canWrite ? <Button variant="outline" icon="pencil" onClick={() => setOpen(true)}>Edit</Button> : null}
        {canWrite ? <Button variant="outline" icon="send" loading={invite.pending} onClick={() => void invite.run()}>{client.hasUser ? "Resend portal invite" : "Invite to portal"}</Button> : null}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit client" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={patch.pending} onClick={() => void patch.run({ name: v.name, email: v.email, phone: v.phone || null, companyName: v.companyName, industry: v.industry || null, website: v.website || null, country: v.country || null })}>Save changes</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {patch.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{patch.error}</p> : null}
          <Field label="Contact name" required error={patch.fields.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Email" required error={patch.fields.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
          <Field label="Company" required>{(p) => <Input {...p} value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} />}</Field>
          <Field label="Phone">{(p) => <Input {...p} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
          <Field label="Industry">{(p) => <Input {...p} value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} />}</Field>
          <Field label="Country">{(p) => <Input {...p} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} />}</Field>
          <Field label="Website" className="sm:col-span-2">{(p) => <Input {...p} type="url" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />}</Field>
        </div>
      </Modal>
    </>
  );
}

export function NewClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ name: "", email: "", companyName: "", phone: "", industry: "", website: "" });
  const go = useAction(async () => api<{ id: string }>("/api/clients", { body: { name: v.name, email: v.email, companyName: v.companyName, phone: v.phone || undefined, industry: v.industry || undefined, website: v.website || undefined } }), {
    refresh: false,
    onSuccess: (c) => (toast.success("Client created"), router.push(`/admin/clients/${c.id}`)),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="grid max-w-3xl gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:grid-cols-2">
      {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{go.error}</p> : null}
      <Field label="Contact name" required error={go.fields.name}>{(p) => <Input {...p} value={v.name} onChange={set("name")} autoFocus />}</Field>
      <Field label="Email" required error={go.fields.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={set("email")} />}</Field>
      <Field label="Company" required error={go.fields.companyName}>{(p) => <Input {...p} value={v.companyName} onChange={set("companyName")} />}</Field>
      <Field label="Phone">{(p) => <Input {...p} value={v.phone} onChange={set("phone")} />}</Field>
      <Field label="Industry">{(p) => <Input {...p} value={v.industry} onChange={set("industry")} />}</Field>
      <Field label="Website" error={go.fields.website}>{(p) => <Input {...p} type="url" value={v.website} onChange={set("website")} placeholder="https://" />}</Field>
      <div className="sm:col-span-2"><Button type="submit" loading={go.pending} disabled={!v.name.trim() || !v.email.trim() || !v.companyName.trim()}>Create client</Button></div>
    </form>
  );
}
