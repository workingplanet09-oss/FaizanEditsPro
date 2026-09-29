"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { PROJECT_STATUSES, STATUS_META, PRIORITY_META, type ProjectStatusKey } from "@/lib/statuses";
import { timeAgo } from "@/lib/format";
import { Uploader, type UploadedAsset } from "@/components/portal/uploader";

// ───────────────────────── status control ─────────────────────────

export function StatusControl({ projectId, status, allowedNext, canOverride, history }: { projectId: string; status: ProjectStatusKey; allowedNext: ProjectStatusKey[]; canOverride: boolean; history: { id: string; from: string | null; to: string; at: string | Date; by: string; comment: string | null; override: boolean }[] }) {
  const toast = useToast();
  const [target, setTarget] = useState<ProjectStatusKey | null>(null);
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState(false);
  const [gate, setGate] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const move = useAction(async () => api(`/api/projects/${projectId}/transition`, { body: { to: target, comment: comment || undefined, override: override || undefined } }), {
    onSuccess: () => (toast.success(`Moved to ${STATUS_META[target!].label}`), setTarget(null), setComment(""), setOverride(false), setGate(null)),
    onError: (e) => (e.code === "GATED" ? setGate(e.message) : e.code === "INVALID_TRANSITION" ? setGate(e.message) : toast.error("Couldn't change status", e.message)),
  });
  const options = overrideMode ? PROJECT_STATUSES.filter((s) => s !== status) : allowedNext;
  const close = () => (setTarget(null), setGate(null), setOverride(false), setComment(""));
  return (
    <Card>
      <CardHeader title="Status" description="Only legal next steps are offered. Payment and approval gates are enforced." action={canOverride ? <button type="button" onClick={() => setOverrideMode((m) => !m)} className={cn("text-xs font-bold", overrideMode ? "text-danger" : "text-subtle hover:text-fg")}>{overrideMode ? "Override mode on" : "Admin override"}</button> : null} />
      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-2">
          {options.length ? options.map((s) => (
            <Button key={s} size="sm" variant={overrideMode ? "danger" : STATUS_META[s].tone === "success" ? "soft" : "outline"} onClick={() => (setTarget(s), setOverride(overrideMode))}>{overrideMode ? "" : "→ "}{STATUS_META[s].label}</Button>
          )) : <p className="text-sm text-muted">No further steps available from this status.</p>}
        </div>
        {history.length ? (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-xs font-bold text-muted hover:text-fg">Status history ({history.length})</summary>
            <ol className="mt-3 space-y-2 border-l border-line pl-4">
              {[...history].reverse().map((h) => (
                <li key={h.id} className="text-xs"><b>{h.from ? `${STATUS_META[h.from as ProjectStatusKey]?.label ?? h.from} → ` : ""}{STATUS_META[h.to as ProjectStatusKey]?.label ?? h.to}</b>{h.override ? <span className="ml-1.5 rounded bg-danger-soft px-1 py-0.5 text-[10px] font-bold uppercase text-danger">override</span> : null}<span className="text-subtle"> · {h.by} · {timeAgo(h.at)}</span>{h.comment ? <span className="block text-muted">{h.comment}</span> : null}</li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
      <Modal open={!!target} onClose={close} size="sm" title={target ? `Move to “${STATUS_META[target].label}”?` : ""} description={target ? STATUS_META[target].clientNow : undefined}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button>{gate && canOverride && !override ? <Button variant="danger" onClick={() => { setOverride(true); setTimeout(() => void move.run(), 0); }}>Override & move</Button> : <Button variant={override ? "danger" : "primary"} loading={move.pending} onClick={() => void move.run()}>{override ? "Override & move" : "Move project"}</Button>}</>}>
        <div className="space-y-4">
          {gate ? <p role="alert" className="flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning"><Icon name="lock" size={16} className="mt-0.5 shrink-0" /><span>{gate}{canOverride ? " You can override this — it will be recorded in the audit log." : ""}</span></p> : null}
          {override ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">This bypasses the normal rules. Your name, the time and the reason are stored permanently.</p> : null}
          <Field label={override ? "Reason (required for overrides)" : "Note (optional, shown in the timeline)"}>{(p) => <Textarea {...p} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        </div>
      </Modal>
    </Card>
  );
}

// ───────────────────────── team ─────────────────────────

export function AssignTeam({ projectId, staff, current, canAssign }: { projectId: string; staff: { id: string; name: string; roles: string[] }[]; current: { managerId: string | null; editorIds: string[]; motionIds: string[]; reviewerIds: string[] }; canAssign: boolean }) {
  const toast = useToast();
  const [v, setV] = useState(current);
  const save = useAction(async () => api(`/api/projects/${projectId}/assign`, { body: { managerId: v.managerId, editorIds: v.editorIds, motionDesignerIds: v.motionIds, reviewerIds: v.reviewerIds } }), { onSuccess: () => toast.success("Team updated"), onError: (e) => toast.error("Couldn't assign", e.message) });
  const multi = (key: "editorIds" | "motionIds" | "reviewerIds", label: string, filter: (r: string[]) => boolean) => (
    <Field label={label} optional={false}>{({ invalid: _invalid, ...p }) => (
      <select {...p} multiple disabled={!canAssign} value={v[key]} onChange={(e) => setV({ ...v, [key]: [...e.target.selectedOptions].map((o) => o.value) })} className="h-28 w-full rounded-xl border border-line-strong bg-surface px-2 py-1.5 text-sm">
        {staff.filter((s) => filter(s.roles) || v[key].includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    )}</Field>
  );
  return (
    <Card>
      <CardHeader title="Team" description="Assigned editors are notified by email." />
      <div className="space-y-4 px-5 pb-5">
        <Field label="Project manager" optional={false}>{(p) => <Select {...p} disabled={!canAssign} value={v.managerId ?? ""} onChange={(e) => setV({ ...v, managerId: e.target.value || null })}><option value="">None</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        {multi("editorIds", "Editors", (r) => r.some((x) => ["editor", "senior_editor", "super_admin", "admin"].includes(x)))}
        {multi("motionIds", "Motion designers", (r) => r.includes("motion_designer"))}
        {multi("reviewerIds", "Internal reviewers", (r) => r.some((x) => ["reviewer", "senior_editor", "project_manager", "admin", "super_admin"].includes(x)))}
        {canAssign ? <Button loading={save.pending} onClick={() => void save.run()}>Save team</Button> : null}
        <p className="text-xs text-subtle">Hold Ctrl/⌘ to select several people.</p>
      </div>
    </Card>
  );
}

// ───────────────────────── versions ─────────────────────────

export function VersionUpload({ projectId, revisions }: { projectId: string; revisions: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [release, setRelease] = useState("auto");
  const [dur, setDur] = useState<number | undefined>();
  const create = useAction(async () => api(`/api/projects/${projectId}/versions`, { body: { assetId: asset?.id, videoUrl: !asset && link ? link : undefined, notes: notes || undefined, changeSummary: summary || undefined, revisionId: revisionId || undefined, release, durationMs: dur } }), {
    onSuccess: () => (setAsset(null), setLink(""), setNotes(""), setSummary(""), setRevisionId(""), toast.success("Version created")),
    onError: (e) => toast.error("Couldn't create version", e.message),
  });
  void router;
  return (
    <Card>
      <CardHeader title="Upload a new version" description="Earlier versions are never overwritten. Clients are notified when a version is released." />
      <div className="space-y-4 px-5 pb-5">
        {!asset ? (
          <>
            <Uploader purpose="version" projectId={projectId} multiple={false} accept="video/*" compact title="Drop the exported video here" hint="MP4 / MOV / WebM — uploads directly to storage" onUploaded={(a) => (setAsset(a), setDur(undefined))} />
            <div className="flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line" />or paste a link (Frame.io, Vimeo, Drive…)<span className="h-px flex-1 bg-line" /></div>
            <Input aria-label="Video link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm"><Icon name="check-circle" className="text-success" size={18} /><span className="min-w-0 flex-1 truncate font-semibold">{asset.displayName}</span><button type="button" className="text-xs font-bold text-muted hover:text-fg" onClick={() => setAsset(null)}>Replace</button></div>
        )}
        <Field label="What changed?" optional={false}>{(p) => <Input {...p} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Tightened intro, swapped music, added captions" />}</Field>
        <Field label="Note to the client" optional={false}>{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Answers revision" optional={false}>{(p) => <Select {...p} value={revisionId} onChange={(e) => setRevisionId(e.target.value)}><option value="">— not a revision —</option>{revisions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>}</Field>
          <Field label="Release" optional={false}>{(p) => <Select {...p} value={release} onChange={(e) => setRelease(e.target.value)}><option value="auto">Follow workflow setting</option><option value="client">Release to client now</option><option value="internal">Send to internal review</option><option value="draft">Team-only draft</option></Select>}</Field>
        </div>
        {create.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{create.error}</p> : null}
        <Button icon="upload" loading={create.pending} disabled={!asset && !link} onClick={() => void create.run()}>Create version</Button>
      </div>
    </Card>
  );
}

// ───────────────────────── deliverables ─────────────────────────

export function DeliverablesAdmin({ projectId, unpublished, canUpload }: { projectId: string; unpublished: number; canUpload: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = useState("Final master — 1080p");
  const publish = useAction(async () => api(`/api/projects/${projectId}/deliverables/publish`, { body: {} }), { onSuccess: (r: any) => toast.success("Published to the client", `${r.published} file${r.published === 1 ? "" : "s"} visible. Downloads unlock per your payment rules.`), onError: (e) => toast.error("Couldn't publish", e.message) });
  return (
    <Card>
      <CardHeader title="Final deliverables" description="Upload the finished files, then publish them. Clients can download once the project is approved and payment conditions are met." />
      <div className="space-y-4 px-5 pb-5">
        {canUpload ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Label shown to the client" optional={false}>{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
          </div>
        ) : null}
        {canUpload ? <Uploader purpose="deliverable" projectId={projectId} label={label} compact title="Drop final exports here" onAllDone={() => router.refresh()} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button icon="send" variant="dark" loading={publish.pending} disabled={!unpublished} onClick={() => void publish.run()}>Publish {unpublished || ""} deliverable{unpublished === 1 ? "" : "s"}</Button>
          {!unpublished ? <span className="text-xs text-subtle">Nothing waiting to be published.</span> : null}
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────── revisions & change requests ─────────────────────────

const REV_NEXT: Record<string, string[]> = { OPEN: ["IN_PROGRESS", "RESOLVED"], IN_PROGRESS: ["RESOLVED", "OPEN"], RESOLVED: ["OPEN"], REJECTED: ["OPEN"], CLOSED: ["OPEN"] };
export function RevisionRow({ id, status, canManage }: { id: string; status: string; canManage: boolean }) {
  const toast = useToast();
  const set = useAction(async (s: string) => api(`/api/revisions/${id}`, { method: "PATCH", body: { status: s } }), { onError: (e) => toast.error("Couldn't update", e.message) });
  if (!canManage) return null;
  return <div className="flex gap-1">{(REV_NEXT[status] ?? []).map((s) => <Button key={s} size="xs" variant="outline" loading={set.pending} onClick={() => void set.run(s)}>{s === "IN_PROGRESS" ? "Start" : s === "RESOLVED" ? "Mark done" : "Reopen"}</Button>)}</div>;
}

export function ChangeRequestReview({ id, classification, staffNote }: { id: string; classification: string; staffNote: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState(classification === "PENDING" ? "INCLUDED" : classification);
  const [note, setNote] = useState(staffNote ?? "");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const go = useAction(async () => api(`/api/change-requests/${id}`, { method: "PATCH", body: { classification: cls, staffNote: note || undefined, createQuote: cls === "ADDITIONAL_COST" && amount ? { title: title || "Change order", amount: Math.round(Number(amount) * 100) } : undefined } }), { onSuccess: () => (setOpen(false), toast.success("Change request updated")), onError: (e) => toast.error("Couldn't update", e.message) });
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>{classification === "PENDING" ? "Review" : "Update"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Review change request" description="The client is notified of your decision." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={go.pending} onClick={() => void go.run()}>Send decision</Button></>}>
        <div className="space-y-4">
          <Field label="Decision" optional={false}>{(p) => <Select {...p} value={cls} onChange={(e) => setCls(e.target.value)}><option value="INCLUDED">Included in scope</option><option value="OUT_OF_SCOPE">Out of scope</option><option value="ADDITIONAL_COST">Needs an additional quote</option></Select>}</Field>
          {cls === "ADDITIONAL_COST" ? <div className="grid grid-cols-2 gap-3"><Field label="Quote title" optional={false}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Extra 9:16 cut-down" />}</Field><Field label="Amount (major units)" optional={false}>{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" />}</Field></div> : null}
          <Field label="Note to the client" optional={false}>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────── project settings (edit) ─────────────────────────

export function ProjectEdit({ project }: { project: { id: string; name: string; description: string; priority: string; deadline: string; revisionLimit: number; currency: string } }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(project);
  const go = useAction(async () => api(`/api/projects/${project.id}`, { method: "PATCH", body: { name: v.name, description: v.description || null, priority: v.priority, deadline: v.deadline || null, revisionLimit: Number(v.revisionLimit) } }), { onSuccess: () => (setOpen(false), toast.success("Project updated")), onError: (e) => toast.error("Couldn't save", e.message) });
  return (
    <>
      <Button variant="outline" icon="pencil" onClick={() => setOpen(true)}>Edit project</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit project" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={go.pending} onClick={() => void go.run()}>Save</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
          <Field label="Priority" optional={false}>{(p) => <Select {...p} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select>}</Field>
          <Field label="Deadline" optional={false}>{(p) => <Input {...p} type="date" value={v.deadline} onChange={(e) => setV({ ...v, deadline: e.target.value })} />}</Field>
          <Field label="Included revision rounds" optional={false}>{(p) => <Input {...p} type="number" min={0} max={20} value={v.revisionLimit} onChange={(e) => setV({ ...v, revisionLimit: Number(e.target.value) })} />}</Field>
        </div>
      </Modal>
    </>
  );
}

export function DuplicateProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const go = useAction(async () => api<{ id: string }>(`/api/projects/${projectId}/duplicate`, { body: { copyOnboarding: true } }), { refresh: false, onSuccess: (r) => (toast.success("Project duplicated"), router.push(`/admin/projects/${r.id}`)), onError: (e) => toast.error("Couldn't duplicate", e.message) });
  return <Button variant="outline" icon="copy" loading={go.pending} onClick={() => void go.run()}>Duplicate</Button>;
}

export function BriefConfirm({ projectId, confirmed }: { projectId: string; confirmed: boolean }) {
  void projectId;
  return confirmed ? <Badge tone="success">Approved by client</Badge> : <Badge tone="warning">Awaiting client approval</Badge>;
}
