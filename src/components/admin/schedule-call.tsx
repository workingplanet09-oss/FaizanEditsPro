"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

export function ScheduleCall({ clients }: { clients: { id: string; label: string }[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: "", type: "DISCOVERY_CALL", when: "", minutes: "30", clientId: "", notes: "" });
  const go = useAction(async () => api("/api/meetings", { body: { title: v.title, type: v.type, startsAt: new Date(v.when).toISOString(), minutes: Number(v.minutes), clientId: v.clientId || null, notes: v.notes || undefined } }), { onSuccess: () => (setOpen(false), setV({ ...v, title: "", when: "", notes: "" }), toast.success("Call scheduled")), onError: (e) => toast.error("Couldn't schedule", e.message) });
  return (
    <>
      <Button icon="plus" variant="dark" onClick={() => setOpen(true)}>Schedule call</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Schedule a call" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={go.pending} disabled={!v.title.trim() || !v.when} onClick={() => void go.run()}>Schedule</Button></>}>
        <div className="space-y-4">
          <Field label="Title" required>{(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Review call — Harbor View" />}</Field>
          <Field label="Type" optional={false}>{(p) => <Select {...p} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="DISCOVERY_CALL">Discovery call</option><option value="PROJECT_CONSULTATION">Project consultation</option><option value="CLIENT_REVIEW_CALL">Client review call</option><option value="STRATEGY_CALL">Strategy call</option></Select>}</Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Date & time" required>{(p) => <Input {...p} type="datetime-local" value={v.when} onChange={(e) => setV({ ...v, when: e.target.value })} />}</Field><Field label="Minutes" optional={false}>{(p) => <Input {...p} type="number" min={10} max={240} step={5} value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })} />}</Field></div>
          <Field label="Client">{(p) => <Select {...p} value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })}><option value="">— none —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
          <Field label="Notes">{(p) => <Textarea {...p} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
        </div>
      </Modal>
    </>
  );
}
