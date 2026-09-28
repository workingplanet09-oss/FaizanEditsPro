"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

const clock = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** Live view of the signed-in user's running timer (one at a time). Starting a timer happens on a project's Time tab. */
export function TimerWidget({ running, base }: { running: { id: string; startedAt: string | Date; note: string | null; project: { id: string; name: string; code: string } } | null; base: "/admin" | "/editor" }) {
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const stop = useAction(async () => api("/api/time/stop", { body: {} }), { onSuccess: () => toast.success("Timer stopped", "Your time was saved."), onError: (e) => toast.error("Couldn't stop", e.message) });
  if (!running) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-subtle"><Icon name="clock" size={18} /></span>
        <div className="min-w-0 flex-1"><div className="text-sm font-bold">No timer running</div><div className="text-xs text-muted">Start one from a project&rsquo;s Time tab.</div></div>
      </Card>
    );
  }
  const elapsed = Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000));
  return (
    <Card className="flex flex-wrap items-center gap-3 border-accent/40 p-4">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="clock" size={18} /><span className="absolute right-0 top-0 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-extrabold tabular-nums leading-none" role="timer" aria-label="Elapsed time">{clock(elapsed)}</div>
        <Link href={`${base}/projects/${running.project.id}?tab=time`} className="mt-1 block truncate text-xs text-muted hover:text-fg hover:underline">{running.project.code} · {running.project.name}{running.note ? ` — ${running.note}` : ""}</Link>
      </div>
      <Button variant="danger" size="sm" icon="pause" loading={stop.pending} onClick={() => void stop.run()}>Stop</Button>
    </Card>
  );
}
