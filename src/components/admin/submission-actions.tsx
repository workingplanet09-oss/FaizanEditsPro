"use client";

import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

export function SubmissionActions({ id, handled, leadId }: { id: string; handled: boolean; leadId: string | null }) {
  const toast = useToast();
  const conv = useAction(async () => api(`/api/contact-submissions/${id}/convert`, { body: {} }), { onSuccess: () => toast.success("Lead created"), onError: (e) => toast.error("Couldn't convert", e.message) });
  const mark = useAction(async (h: boolean) => api(`/api/contact-submissions/${id}/handled`, { body: { handled: h } }), { onSuccess: () => toast.success("Updated") });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {leadId ? <Link href={`/admin/leads/${leadId}`} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-accent hover:underline">Open lead</Link> : <Button size="xs" variant="outline" loading={conv.pending} onClick={() => void conv.run()}>Create lead</Button>}
      <Button size="xs" variant="ghost" loading={mark.pending} onClick={() => void mark.run(!handled)}>{handled ? "Mark unhandled" : "Mark handled"}</Button>
    </div>
  );
}
