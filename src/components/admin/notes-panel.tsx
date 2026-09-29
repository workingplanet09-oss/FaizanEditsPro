"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";
import { Ago } from "@/components/ui/time";

export interface NoteRow { id: string; body: string; pinned: boolean; createdAt: string | Date; author: { id: string; name: string }; mine: boolean }

/** Internal notes — visible to the team only, never to clients. */
export function NotesPanel({ entityType, entityId, notes, canWrite }: { entityType: "LEAD" | "CLIENT" | "PROJECT" | "TASK" | "INVOICE"; entityId: string; notes: NoteRow[]; canWrite: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const add = useAction(async () => api("/api/notes", { body: { entityType, entityId, body: text } }), { onSuccess: () => (setText(""), toast.success("Note added")), onError: (e) => toast.error("Couldn't add note", e.message) });
  const pin = useAction(async (id: string, pinned: boolean) => api(`/api/notes/${id}`, { method: "PATCH", body: { pinned } }));
  const del = useAction(async (id: string) => api(`/api/notes/${id}`, { method: "DELETE" }), { onSuccess: () => toast.success("Note deleted") });
  return (
    <Card>
      <CardHeader title="Internal notes" description="Team only — clients never see these." />
      <div className="space-y-3 px-5 pb-5">
        {canWrite ? (
          <div>
            <label htmlFor={`note-${entityId}`} className="sr-only">Add an internal note</label>
            <textarea id={`note-${entityId}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a note for the team…" className="w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20" />
            <div className="mt-2 flex justify-end"><Button size="sm" loading={add.pending} disabled={!text.trim()} onClick={() => void add.run()}>Add note</Button></div>
          </div>
        ) : null}
        {notes.length ? (
          <ul className="space-y-2.5">
            {notes.map((n) => (
              <li key={n.id} className={cn("rounded-xl border p-3.5", n.pinned ? "border-warning/40 bg-warning-soft/40" : "border-line bg-surface-2/40")}>
                <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                  <span>{n.author.name} · <Ago value={n.createdAt} />{n.pinned ? " · pinned" : ""}</span>
                  {canWrite ? (
                    <span className="flex gap-1">
                      <button type="button" className="rounded p-1 hover:bg-surface-2 hover:text-fg" aria-label={n.pinned ? "Unpin note" : "Pin note"} onClick={() => void pin.run(n.id, !n.pinned)}><Icon name="star" size={13} className={n.pinned ? "fill-current" : ""} /></button>
                      {n.mine ? <button type="button" className="rounded p-1 hover:bg-danger-soft hover:text-danger" aria-label="Delete note" onClick={() => void del.run(n.id)}><Icon name="trash" size={13} /></button> : null}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="py-2 text-sm text-muted">No notes yet.</p>}
      </div>
    </Card>
  );
}
