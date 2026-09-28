"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function RetainerStart({ id, base = "/dashboard" }: { id: string; base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", kind: "VIDEO", description: "", deadline: "" });
  const go = useAction(async () => api<{ id: string }>(`/api/retainers/${id}/projects`, { body: { name: v.name, kind: v.kind, description: v.description || undefined, deadline: v.deadline || undefined } }), {
    refresh: false,
    onSuccess: (r) => {
      toast.success("Project started from your retainer");
      setOpen(false);
      router.push(`${base}/projects/${r.id}`);
    },
  });
  return (
    <>
      <Button icon="plus" variant="dark" onClick={() => setOpen(true)}>Start a project from this retainer</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New retainer project" description="Uses one of your included videos or shorts this month — no new quote or invoice needed." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={go.pending} disabled={v.name.trim().length < 2} onClick={() => void go.run()}>Start project</Button></>}>
        <div className="space-y-4">
          {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{go.error}</p> : null}
          <Field label="Project name" required error={go.fields.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. October product reel" />}</Field>
          <Field label="Type" required>{(p) => <Select {...p} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="VIDEO">Video</option><option value="SHORT">Short-form</option></Select>}</Field>
          <Field label="What do you need?">{(p) => <Textarea {...p} rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
          <Field label="Deadline">{(p) => <Input {...p} type="date" value={v.deadline} onChange={(e) => setV({ ...v, deadline: e.target.value })} />}</Field>
        </div>
      </Modal>
    </>
  );
}
