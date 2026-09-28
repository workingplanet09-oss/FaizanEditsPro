"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatBytes, formatDateShort } from "@/lib/format";
import { openAsset } from "./file-manager";
import { ButtonLink } from "@/components/ui/button";
import type { ProjectStatusKey } from "@/lib/statuses";

interface Item {
  id: string;
  displayName: string;
  deliverableLabel: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string | Date;
  visibleToClient: boolean;
}

/** Final deliverables. Locked with a plain-language reason until approval and payment conditions are met. */
export function DeliveryList({ items, unlocked, lockedReason, status, projectId, staff = false }: { items: Item[]; unlocked: boolean; lockedReason: string | null; status: ProjectStatusKey; projectId: string; staff?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const visible = staff ? items : items.filter((i) => i.visibleToClient);

  async function get(id: string) {
    setBusy(id);
    try {
      await openAsset(id);
    } catch (e: any) {
      toast.error("Can't download yet", e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!visible.length) {
    return (
      <Card>
        <EmptyState
          icon="package"
          title={status === "APPROVED" ? "We're preparing your final files" : "No final files yet"}
          description={status === "APPROVED" ? "You approved the video — we're exporting the final deliverables now. You'll get a notification the moment they're ready." : "Your final files will appear here once the video is approved and delivered."}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {!unlocked ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft/70 p-5 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex gap-3">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-warning" />
            <div><h3 className="font-extrabold">Your final files are ready — and waiting for you</h3><p className="mt-0.5 text-sm text-muted">{lockedReason}</p></div>
          </div>
          {!staff ? <ButtonLink href={`/dashboard/projects/${projectId}?tab=billing`} variant="dark" icon="card">View invoices</ButtonLink> : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/50 px-5 py-4 text-sm" role="status"><Icon name="check-circle" size={20} className="text-success" /><span><b>Ready to download.</b> Links are private and expire after an hour — just click again for a fresh one.</span></div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
        {visible.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={f.mimeType.startsWith("video/") ? "video" : f.mimeType.startsWith("image/") ? "image" : "file"} size={20} /></span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="truncate text-sm font-bold">{f.deliverableLabel || f.displayName}</div>
              <div className="truncate text-xs text-muted">{f.displayName} · {formatBytes(f.sizeBytes)} · {formatDateShort(f.createdAt)}{!f.visibleToClient ? " · unpublished" : ""}</div>
            </div>
            <Button variant={unlocked || staff ? "dark" : "outline"} icon={unlocked || staff ? "download" : "lock"} loading={busy === f.id} disabled={!unlocked && !staff} onClick={() => void get(f.id)}>{unlocked || staff ? "Download" : "Locked"}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
