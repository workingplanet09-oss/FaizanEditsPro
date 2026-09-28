"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/form";

export function QuoteActions({ id, projectId }: { id: string; projectId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const accept = useAction(async () => api(`/api/quotes/${id}/accept`, { body: {} }), {
    refresh: true,
    onSuccess: () => {
      toast.success("Quote accepted", "Your contract is next.");
      if (projectId) router.push(`/dashboard/projects/${projectId}`);
    },
    onError: (e) => toast.error("Couldn't accept the quote", e.message),
  });
  const decline = useAction(async () => api(`/api/quotes/${id}/reject`, { body: { reason: reason || undefined } }), {
    onSuccess: () => {
      setDeclining(false);
      toast.info("Quote declined", "Thanks for letting us know.");
    },
    onError: (e) => toast.error("Couldn't decline", e.message),
  });
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" icon="check-circle" loading={accept.pending} onClick={() => void accept.run()}>Accept quote</Button>
        <Button size="lg" variant="outline" onClick={() => setDeclining(true)}>Decline</Button>
        <a href="/dashboard/messages" className="inline-flex h-13 items-center px-3 text-sm font-semibold text-muted hover:text-fg">Ask a question first</a>
      </div>
      <Modal open={declining} onClose={() => setDeclining(false)} size="sm" title="Decline this quote?" description="We'd love to make it work — tell us what would change your mind." footer={<><Button variant="ghost" onClick={() => setDeclining(false)}>Cancel</Button><Button variant="danger" loading={decline.pending} onClick={() => void decline.run()}>Decline quote</Button></>}>
        <Field label="Reason (optional)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Budget, timing, scope…" />}</Field>
      </Modal>
    </>
  );
}
