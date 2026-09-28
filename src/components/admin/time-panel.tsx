"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";
import { formatDateShort } from "@/lib/format";

export interface TimeRow { id: string; seconds: number; note: string | null; startedAt: string | Date; endedAt: string | Date | null; user: { name: string } }
const hm = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;

export function TimePanel({ projectId, entries, running, canTrack }: { projectId: string; entries: TimeRow[]; running: { id: string; projectId: string; startedAt: string | Date } | null; canTrack: boolean }) {
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState("");
  const [mins, setMins] = useState("");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const start = useAction(async () => api("/api/time", { body: { projectId, note: note || undefined } }), { onSuccess: () => (setNote(""), toast.success("Timer started")), onError: (e) => toast.error("Couldn't start", e.message) });
  const stop = useAction(async () => api("/api/time/stop", { body: {} }), { onSuccess: () => toast.success("Timer stopped") });
  const manual = useAction(async () => api("/api/time", { body: { projectId, minutes: Number(mins), note: note || undefined } }), { onSuccess: () => (setMins(""), setNote(""), toast.success("Time added")), onError: (e) => toast.error("Couldn't add time", e.message) });
  const total = entries.reduce((s, e) => s + e.seconds, 0);
  const runningHere = running && running.projectId === projectId;
  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000)) : 0;
  return (
    <Card>
      <CardHeader title="Time tracking" description={`${hm(total)} logged on this project`} />
      {canTrack ? (
        <div className="grid gap-3 px-5 pb-4 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Note" optional={false}>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on?" />}</Field>
          <div className="flex items-end gap-2">
            {runningHere ? (
              <Button variant="danger" icon="pause" loading={stop.pending} onClick={() => void stop.run()}>Stop · {hm(elapsed)}</Button>
            ) : (
              <Button icon="play" loading={start.pending} disabled={!!running} onClick={() => void start.run()} title={running ? "Stop your other timer first" : undefined}>Start timer</Button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <Field label="Or add minutes" optional={false}>{(p) => <Input {...p} className="w-28" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} placeholder="45" />}</Field>
            <Button variant="outline" loading={manual.pending} disabled={!mins} onClick={() => void manual.run()}>Add</Button>
          </div>
        </div>
      ) : null}
      {entries.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {entries.slice(0, 30).map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><Icon name="clock" size={14} className="text-subtle" /><span className="w-16 shrink-0 font-semibold tabular-nums">{e.endedAt ? hm(e.seconds) : "running"}</span><span className="min-w-0 flex-1 truncate text-muted">{e.note || "—"}</span><span className="hidden text-xs text-subtle sm:inline">{e.user.name}</span><span className="text-xs text-subtle">{formatDateShort(e.startedAt)}</span></li>
          ))}
        </ul>
      ) : <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">No time logged yet.</p>}
    </Card>
  );
}
