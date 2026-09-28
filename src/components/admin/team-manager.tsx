"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { toMinor, fromMinor } from "@/lib/money";
import { timeAgo } from "@/lib/format";

interface Member { id: string; name: string; email: string; status: string; roles: { key: string; name: string }[]; lastLoginAt: string | Date | null; twoFactorEnabled: boolean; projects: number; hourlyCost: number | null }
interface Role { key: string; name: string; description: string | null; rank: number; permissions: string[] }

export function TeamManager({ members, roles, meId, isSuper }: { members: Member[]; roles: Role[]; meId: string; isSuper: boolean }) {
  const toast = useToast();
  const [edit, setEdit] = useState<Member | "new" | null>(null);
  const [showRoles, setShowRoles] = useState(false);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Team" description={`${members.filter((m) => m.status === "ACTIVE").length} active · ${members.length} total`} action={<Button icon="plus" variant="dark" size="sm" onClick={() => setEdit("new")}>Invite teammate</Button>} />
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <Avatar name={m.name} size={38} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{m.name}</b>{m.id === meId ? <span className="text-xs text-subtle">(you)</span> : null}{m.status === "INVITED" ? <Badge tone="warning">Invited</Badge> : m.status === "SUSPENDED" ? <Badge tone="danger">Suspended</Badge> : null}{m.twoFactorEnabled ? <Badge tone="success" icon="shield" dot={false}>2FA</Badge> : null}</div>
                <div className="truncate text-xs text-muted">{m.email} · {m.lastLoginAt ? `seen ${timeAgo(m.lastLoginAt)}` : "never signed in"}</div>
              </div>
              <div className="flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r.key} tone={r.key === "super_admin" ? "accent" : "neutral"} dot={false} icon={false}>{r.name}</Badge>)}</div>
              <span className="w-20 text-right text-xs text-subtle">{m.projects} project{m.projects === 1 ? "" : "s"}</span>
              <Button size="sm" variant="outline" onClick={() => setEdit(m)}>Manage</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Roles & permissions" description="What each role can do. Clients never have any of these." action={<Button size="sm" variant="ghost" onClick={() => setShowRoles((s) => !s)}>{showRoles ? "Hide" : "Show details"}</Button>} />
        <ul className="divide-y divide-line">
          {roles.map((r) => (
            <li key={r.key} className="px-5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><b className="text-sm">{r.name}</b><span className="text-xs text-subtle">{r.permissions.length} permissions</span></div>
              <p className="text-xs text-muted">{r.description}</p>
              {showRoles ? <div className="mt-2 flex flex-wrap gap-1">{r.permissions.map((p) => <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{p}</span>)}</div> : null}
            </li>
          ))}
        </ul>
      </Card>
      {edit ? <MemberModal key={edit === "new" ? "new" : edit.id} member={edit === "new" ? null : edit} roles={roles.filter((r) => isSuper || r.key !== "super_admin")} meId={meId} onClose={() => setEdit(null)} toast={toast} /> : null}
    </div>
  );
}

function MemberModal({ member, roles, meId, onClose, toast }: { member: Member | null; roles: Role[]; meId: string; onClose: () => void; toast: ReturnType<typeof useToast> }) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [sel, setSel] = useState<string[]>(member?.roles.map((r) => r.key) ?? ["editor"]);
  const [cost, setCost] = useState(member?.hourlyCost != null ? String(fromMinor(member.hourlyCost, "USD")) : "");
  const save = useAction(async () => (member ? api(`/api/admin/team/${member.id}`, { method: "PATCH", body: { name, roleKeys: sel, hourlyCost: cost ? toMinor(Number(cost), "USD") : null } }) : api("/api/admin/team", { body: { name, email, roleKeys: sel, hourlyCost: cost ? toMinor(Number(cost), "USD") : null } })), { onSuccess: () => (toast.success(member ? "Saved" : "Invitation sent", member ? undefined : `${email} will get an email to set a password.`), onClose()), onError: (e) => toast.error("Couldn't save", e.message) });
  const suspend = useAction(async (s: boolean) => api(`/api/admin/team/${member!.id}`, { method: "PATCH", body: { suspended: s } }), { onSuccess: () => (toast.success("Updated"), onClose()), onError: (e) => toast.error("Couldn't update", e.message) });
  return (
    <Modal open onClose={onClose} size="md" title={member ? `Manage ${member.name}` : "Invite a teammate"} footer={<>{member && member.id !== meId ? <Button variant={member.status === "SUSPENDED" ? "outline" : "danger"} loading={suspend.pending} className="mr-auto" onClick={() => void suspend.run(member.status !== "SUSPENDED")}>{member.status === "SUSPENDED" ? "Reactivate" : "Suspend access"}</Button> : null}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.pending} disabled={name.trim().length < 2 || (!member && !email) || !sel.length} onClick={() => void save.run()}>{member ? "Save" : "Send invite"}</Button></>}>
      <div className="space-y-4">
        {save.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{save.error}</p> : null}
        <Field label="Name" required error={save.fields.name}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email" required error={save.fields.email}>{(p) => <Input {...p} type="email" disabled={!!member} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Roles</legend>
          <div className="space-y-2">{roles.map((r) => <Checkbox key={r.key} checked={sel.includes(r.key)} onChange={(e) => setSel(e.target.checked ? [...sel, r.key] : sel.filter((k) => k !== r.key))} label={r.name} description={r.description ?? undefined} />)}</div>
        </fieldset>
        <Field label="Internal hourly cost (USD)" optional hint="Used only for the profitability report. Never shown to clients.">{(p) => <Input {...p} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
