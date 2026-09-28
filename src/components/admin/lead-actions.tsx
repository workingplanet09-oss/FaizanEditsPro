"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Card, CardHeader } from "@/components/ui/primitives";
import { LEAD_STATUS_META, TEMPERATURE_META } from "@/lib/statuses";

const ACTIVITY_TYPES = [["note", "Note"], ["contacted", "Contacted"], ["email_sent", "Email sent"], ["call_made", "Call made"], ["call_scheduled", "Call scheduled"], ["meeting", "Meeting"]] as const;

export function LeadControls({ lead, staff, canWrite }: { lead: { id: string; status: string; assignedToId: string | null; nextFollowUpAt: string | Date | null; temperature: string; overridden: boolean; computedTemperature: string; lostReason: string | null }; staff: { id: string; name: string }[]; canWrite: boolean }) {
  const toast = useToast();
  const patch = useAction(async (body: Record<string, unknown>) => api(`/api/leads/${lead.id}`, { method: "PATCH", body }), { onSuccess: () => toast.success("Lead updated"), onError: (e) => toast.error("Couldn't update", e.message) });
  const follow = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toISOString().slice(0, 10) : "";
  return (
    <Card>
      <CardHeader title="Manage lead" />
      <div className="grid gap-4 px-5 pb-5">
        <Field label="Status" optional={false}>{(p) => (
          <Select {...p} disabled={!canWrite} value={lead.status} onChange={(e) => void patch.run({ status: e.target.value })}>
            {Object.entries(LEAD_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        )}</Field>
        <Field label="Assigned to" optional={false}>{(p) => (
          <Select {...p} disabled={!canWrite} value={lead.assignedToId ?? ""} onChange={(e) => void patch.run({ assignedToId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}</Field>
        <Field label="Next follow-up" optional={false}>{(p) => <Input {...p} type="date" disabled={!canWrite} defaultValue={follow} onChange={(e) => void patch.run({ nextFollowUpAt: e.target.value || null })} />}</Field>
        <Field label="Lead temperature" optional={false} hint={lead.overridden ? `Auto-scored as ${TEMPERATURE_META[lead.computedTemperature]?.label}; you overrode it.` : "Auto-scored from the answers. Internal only — visitors never see it."}>{(p) => (
          <Select {...p} disabled={!canWrite} value={lead.overridden ? lead.temperature : ""} onChange={(e) => void patch.run({ temperatureOverride: e.target.value || null })}>
            <option value="">Auto ({TEMPERATURE_META[lead.computedTemperature]?.label})</option>
            {Object.entries(TEMPERATURE_META).map(([k, v]) => <option key={k} value={k}>Override: {v.label}</option>)}
          </Select>
        )}</Field>
      </div>
    </Card>
  );
}

export function LeadActivityForm({ leadId }: { leadId: string }) {
  const toast = useToast();
  const [type, setType] = useState("note");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const add = useAction(async () => api(`/api/leads/${leadId}/activities`, { body: { type, title, note: note || undefined, nextFollowUpAt: next || null } }), { onSuccess: () => (setTitle(""), setNote(""), setNext(""), toast.success("Activity logged")), onError: (e) => toast.error("Couldn't log", e.message) });
  return (
    <Card>
      <CardHeader title="Log activity" />
      <form onSubmit={(e) => (e.preventDefault(), void add.run())} className="grid gap-3 px-5 pb-5 sm:grid-cols-[10rem_1fr]">
        <Field label="Type" optional={false}>{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>{ACTIVITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Summary" required>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Called — wants a quote by Friday" />}</Field>
        <Field label="Details" className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <Field label="Set follow-up" className="sm:col-span-1">{(p) => <Input {...p} type="date" value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <div className="flex items-end justify-end"><Button type="submit" loading={add.pending} disabled={!title.trim()}>Log activity</Button></div>
      </form>
    </Card>
  );
}

export function LeadDecisions({ leadId, status, canConvert, canWrite, hasClient }: { leadId: string; status: string; canConvert: boolean; canWrite: boolean; hasClient: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [opts, setOpts] = useState({ createProject: true, invite: true, projectName: "" });
  const [reason, setReason] = useState("");
  const convert = useAction(async () => api<{ clientId: string; projectId: string | null }>(`/api/leads/${leadId}/convert`, { body: { createProject: opts.createProject, invite: opts.invite, projectName: opts.projectName || undefined } }), {
    refresh: false,
    onSuccess: (r) => {
      toast.success("Lead converted", r.projectId ? "Client and project created." : "Client created.");
      setConvertOpen(false);
      router.push(r.projectId ? `/admin/projects/${r.projectId}` : `/admin/clients/${r.clientId}`);
    },
    onError: (e) => toast.error("Couldn't convert", e.message),
  });
  const reject = useAction(async () => api(`/api/leads/${leadId}/reject`, { body: { reason: reason || undefined } }), { onSuccess: () => (setLostOpen(false), toast.info("Lead marked as lost")), onError: (e) => toast.error("Couldn't update", e.message) });
  const archive = useAction(async (a: boolean) => api(`/api/leads/${leadId}/archive`, { body: { archive: a } }), { onSuccess: () => toast.info("Lead updated") });
  const closed = status === "LOST" || status === "ARCHIVED";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canConvert && status !== "CONVERTED" ? <Button icon="check-circle" onClick={() => setConvertOpen(true)} disabled={closed}>{hasClient ? "Create project for client" : "Convert to client"}</Button> : null}
        {canWrite && !closed && status !== "CONVERTED" ? <Button variant="outline" onClick={() => setLostOpen(true)}>Mark as lost</Button> : null}
        {canWrite && closed ? <Button variant="outline" loading={archive.pending} onClick={() => void archive.run(false)}>Reopen lead</Button> : null}
        {canWrite && !closed ? <Button variant="ghost" loading={archive.pending} onClick={() => void archive.run(true)}>Archive</Button> : null}
      </div>
      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} size="sm" title="Convert this lead" description="Creates the client record (or links the existing one) and can start the project in “Awaiting quote”." footer={<><Button variant="ghost" onClick={() => setConvertOpen(false)}>Cancel</Button><Button loading={convert.pending} onClick={() => void convert.run()}>Convert</Button></>}>
        <div className="space-y-4">
          <Checkbox checked={opts.createProject} onChange={(e) => setOpts({ ...opts, createProject: e.target.checked })} label="Create the project now" description="Uses the lead's answers as the starting brief." />
          {opts.createProject ? <Field label="Project name">{(p) => <Input {...p} value={opts.projectName} onChange={(e) => setOpts({ ...opts, projectName: e.target.value })} placeholder="Leave blank for an automatic name" />}</Field> : null}
          <Checkbox checked={opts.invite} onChange={(e) => setOpts({ ...opts, invite: e.target.checked })} label="Invite them to the client portal" description="They'll get an email to set a password." />
        </div>
      </Modal>
      <Modal open={lostOpen} onClose={() => setLostOpen(false)} size="sm" title="Mark as lost" footer={<><Button variant="ghost" onClick={() => setLostOpen(false)}>Cancel</Button><Button variant="danger" loading={reject.pending} onClick={() => void reject.run()}>Mark as lost</Button></>}>
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Budget, timing, went elsewhere…" />}</Field>
      </Modal>
    </>
  );
}
