"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";

export function CompanyForm({ clientId, initial, canEdit }: { clientId: string; initial: Record<string, string>; canEdit: boolean }) {
  const toast = useToast();
  const [v, setV] = useState(initial);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const go = useAction(async () => api(`/api/clients/${clientId}/company`, { method: "PATCH", body: { companyName: v.companyName, industry: v.industry || null, website: v.website || null, country: v.country || null, phone: v.phone || null, billingEmail: v.billingEmail || null, billingAddress: v.billingAddress || null, taxId: v.taxId || null } }), { onSuccess: () => toast.success("Company details saved"), onError: (e) => toast.error("Couldn't save", e.message) });
  return (
    <Card>
      <CardHeader title="Company & billing" description="Shown on invoices and contracts." />
      <form onSubmit={(e) => (e.preventDefault(), void go.run())} className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2">
        <Field label="Company name" required error={go.fields.companyName}>{(p) => <Input {...p} disabled={!canEdit} value={v.companyName} onChange={set("companyName")} autoComplete="organization" />}</Field>
        <Field label="Industry">{(p) => <Input {...p} disabled={!canEdit} value={v.industry} onChange={set("industry")} />}</Field>
        <Field label="Website">{(p) => <Input {...p} type="url" disabled={!canEdit} value={v.website} onChange={set("website")} />}</Field>
        <Field label="Country">{(p) => <Input {...p} disabled={!canEdit} value={v.country} onChange={set("country")} />}</Field>
        <Field label="Company phone">{(p) => <Input {...p} disabled={!canEdit} value={v.phone} onChange={set("phone")} />}</Field>
        <Field label="Billing email" error={go.fields.billingEmail}>{(p) => <Input {...p} type="email" disabled={!canEdit} value={v.billingEmail} onChange={set("billingEmail")} />}</Field>
        <Field label="Billing address" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} disabled={!canEdit} value={v.billingAddress} onChange={set("billingAddress")} />}</Field>
        <Field label="Tax / VAT ID">{(p) => <Input {...p} disabled={!canEdit} value={v.taxId} onChange={set("taxId")} />}</Field>
        <div className="sm:col-span-2">{canEdit ? <Button type="submit" loading={go.pending}>Save company</Button> : <p className="text-sm text-muted">Only account owners and managers can edit company details.</p>}</div>
      </form>
    </Card>
  );
}

interface Member { id: string; role: string; title: string | null; user: { id: string; name: string; email: string; status: string; lastLoginAt: string | Date | null } }
const ROLES = [["OWNER", "Owner — everything"], ["MANAGER", "Manager — projects & approvals"], ["ASSISTANT", "Assistant — upload & message"], ["BILLING", "Billing — invoices & payments"], ["MEMBER", "Member — view & comment"]] as const;

export function MembersManager({ organizationId, members, canManage, meId }: { organizationId: string; members: Member[]; canManage: boolean; meId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", email: "", role: "MEMBER", title: "" });
  const [remove, setRemove] = useState<Member | null>(null);
  const add = useAction(async () => api(`/api/organizations/${organizationId}/members`, { body: { name: v.name, email: v.email, role: v.role, title: v.title || undefined } }), { onSuccess: () => (setOpen(false), setV({ name: "", email: "", role: "MEMBER", title: "" }), toast.success("Invitation sent", "They'll get an email to set a password.")) });
  const change = useAction(async (id: string, role: string) => api(`/api/members/${id}`, { method: "PATCH", body: { role } }), { onSuccess: () => toast.success("Role updated"), onError: (e) => toast.error("Couldn't change role", e.message) });
  const del = useAction(async (id: string) => api(`/api/members/${id}`, { method: "DELETE" }), { onSuccess: () => (setRemove(null), toast.success("Member removed")), onError: (e) => toast.error("Couldn't remove", e.message) });
  return (
    <Card>
      <CardHeader title="Team members" description="People at your company who can use this portal." action={canManage ? <Button size="sm" icon="plus" onClick={() => setOpen(true)}>Invite</Button> : null} />
      <ul className="divide-y divide-line px-5 pb-2">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-3.5">
            <Avatar name={m.user.name} size={36} />
            <div className="min-w-0 flex-1 basis-48"><div className="truncate text-sm font-bold">{m.user.name}{m.user.id === meId ? <span className="ml-2 text-xs font-medium text-subtle">(you)</span> : null}</div><div className="truncate text-xs text-muted">{m.user.email}{m.user.lastLoginAt ? ` · seen ${timeAgo(m.user.lastLoginAt)}` : ""}</div></div>
            {m.user.status === "INVITED" ? <Badge tone="warning">Invited</Badge> : null}
            {canManage ? (
              <select aria-label={`Role of ${m.user.name}`} value={m.role} onChange={(e) => void change.run(m.id, e.target.value)} className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium">{ROLES.map(([k, l]) => <option key={k} value={k}>{l.split(" — ")[0]}</option>)}</select>
            ) : <Badge tone="neutral" dot={false} icon={false}>{m.role.toLowerCase()}</Badge>}
            {canManage && m.user.id !== meId ? <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${m.user.name}`} onClick={() => setRemove(m)} /> : null}
          </li>
        ))}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite a colleague" description="They'll receive an email to set a password and join your company." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.pending} disabled={!v.name.trim() || !v.email.trim()} onClick={() => void add.run()}>Send invite</Button></>}>
        <div className="space-y-4">
          {add.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{add.error}</p> : null}
          <Field label="Name" required error={add.fields.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Email" required error={add.fields.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
          <Field label="Role" required>{(p) => <Select {...p} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
          <Field label="Job title">{(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        </div>
      </Modal>
      <ConfirmModal open={!!remove} onClose={() => setRemove(null)} tone="danger" loading={del.pending} title="Remove this person?" description={remove ? `${remove.user.name} will lose access to your company's projects and files.` : undefined} confirmLabel="Remove" onConfirm={() => { if (remove) void del.run(remove.id); }} />
    </Card>
  );
}
