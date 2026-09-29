"use client";

import { useCallback, useRef, useState } from "react";
import { api, ApiError, uploadToSignedUrl } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { Icon } from "@/components/ui/icon";

export interface UploadedAsset {
  id: string;
  displayName: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  folderKey?: string | null;
}

interface Item {
  key: string;
  file: File;
  pct: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
  asset?: UploadedAsset;
  abort?: AbortController;
}

export interface UploaderProps {
  purpose?: "asset" | "version" | "deliverable" | "brand" | "lead_reference";
  projectId?: string;
  clientId?: string;
  draftToken?: string;
  folderKey?: string;
  fileRequestId?: string;
  label?: string;
  accept?: string;
  multiple?: boolean;
  compact?: boolean;
  maxFiles?: number;
  title?: string;
  hint?: string;
  onUploaded?: (asset: UploadedAsset) => void;
  onAllDone?: () => void;
}

/** Captures a small JPEG poster from a video file entirely in the browser (no server-side ffmpeg needed). */
async function capturePoster(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/")) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.playsInline = true;
    const done = (b: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 8000);
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 640 / (v.videoWidth || 640));
        c.width = Math.round((v.videoWidth || 640) * scale);
        c.height = Math.round((v.videoHeight || 360) * scale);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => (clearTimeout(timer), done(b)), "image/jpeg", 0.75);
      } catch {
        clearTimeout(timer);
        done(null);
      }
    };
    v.onerror = () => (clearTimeout(timer), done(null));
    v.src = url;
  });
}

async function videoDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith("video/")) return undefined;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined);
    };
    v.onerror = () => (URL.revokeObjectURL(url), resolve(undefined));
    v.src = url;
  });
}

export function Uploader(props: UploaderProps) {
  const { purpose = "asset", multiple = true, maxFiles = 50 } = props;
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const patch = useCallback((key: string, p: Partial<Item>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const run = useCallback(
    async (item: Item) => {
      const ctrl = new AbortController();
      patch(item.key, { state: "uploading", pct: 0, error: undefined, abort: ctrl });
      try {
        const { file } = item;
        const r = await api<{ asset: UploadedAsset; upload: { url: string; method: string; headers: Record<string, string> } }>("/api/assets/upload-url", {
          body: { purpose, projectId: props.projectId, clientId: props.clientId, draftToken: props.draftToken, folderKey: props.folderKey, filename: file.name, size: file.size, mimeType: file.type || "application/octet-stream", fileRequestId: props.fileRequestId, label: props.label },
        });
        await uploadToSignedUrl(r.upload, file, (pct) => patch(item.key, { pct }), ctrl.signal);
        const duration = await videoDuration(file);
        const done = await api<UploadedAsset>(`/api/assets/${r.asset.id}/complete`, { body: { draftToken: props.draftToken, fileRequestId: props.fileRequestId, durationMs: duration } });
        // poster frame for videos — best effort, never blocks the upload
        if (file.type.startsWith("video/") && purpose !== "lead_reference") {
          capturePoster(file)
            .then(async (blob) => {
              if (!blob) return;
              const t = await api<{ upload: { url: string; method: string; headers: Record<string, string> } }>(`/api/assets/${r.asset.id}/thumbnail`, { method: "POST", body: {} });
              await uploadToSignedUrl(t.upload, blob);
              await api(`/api/assets/${r.asset.id}/thumbnail`, { method: "PUT", body: {} });
            })
            .catch(() => {});
        }
        patch(item.key, { state: "done", pct: 100, asset: done });
        props.onUploaded?.(done);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return patch(item.key, { state: "error", error: "Cancelled" });
        patch(item.key, { state: "error", error: e instanceof ApiError ? e.message : "Upload failed. Check your connection and retry." });
      }
    },
    [patch, props, purpose],
  );

  const add = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, Math.max(0, maxFiles));
      const newItems: Item[] = list.map((file) => ({ key: `u${++seq.current}`, file, pct: 0, state: "queued" }));
      setItems((p) => [...newItems, ...p]);
      // modest concurrency so a huge drop doesn't saturate the connection
      const queue = [...newItems];
      const worker = async () => {
        for (let it = queue.shift(); it; it = queue.shift()) await run(it);
      };
      await Promise.all([worker(), worker(), worker()]);
      props.onAllDone?.();
    },
    [maxFiles, run, props],
  );

  const busy = items.some((i) => i.state === "uploading" || i.state === "queued");

  return (
    <div>
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void add(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]]);
        }}
        className={cn("relative rounded-2xl border-2 border-dashed text-center transition", drag ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/40 hover:border-subtle", props.compact ? "p-5" : "p-8")}
      >
        <input ref={input} type="file" className="sr-only" multiple={multiple} accept={props.accept} onChange={(e) => e.target.files?.length && (void add(e.target.files), (e.target.value = ""))} aria-label={props.title ?? "Choose files to upload"} />
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface shadow-soft"><Icon name="upload" size={20} /></span>
        <p className="mt-3 text-sm font-bold">{props.title ?? "Drag & drop files here"}</p>
        <p className="mt-1 text-xs text-muted">{props.hint ?? "or"} <button type="button" onClick={() => input.current?.click()} className="font-bold text-fg underline underline-offset-2 hover:text-accent-text">browse your computer</button></p>
      </div>

      {items.length ? (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", i.state === "done" ? "bg-success-soft text-success" : i.state === "error" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
                  <Icon name={i.state === "done" ? "check" : i.state === "error" ? "alert" : i.file.type.startsWith("video/") ? "video" : "file"} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{i.file.name}</span>
                    <span className="shrink-0 text-xs text-subtle">{formatBytes(i.file.size)}</span>
                  </div>
                  {i.state === "uploading" || i.state === "queued" ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div role="progressbar" aria-valuenow={i.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.file.name}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${i.pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted">{i.pct}%</span>
                    </div>
                  ) : i.state === "error" ? (
                    <p className="mt-0.5 text-xs font-medium text-danger">{i.error}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-success">Uploaded{i.asset && i.asset.version > 1 ? ` · version ${i.asset.version}` : ""}</p>
                  )}
                </div>
                {i.state === "uploading" ? (
                  <button type="button" onClick={() => i.abort?.abort()} className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2">Cancel</button>
                ) : i.state === "error" ? (
                  <button type="button" onClick={() => void run(i)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold hover:bg-line">Retry</button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {busy ? <p className="mt-2 text-xs text-subtle">Keep this tab open until uploads finish.</p> : null}
    </div>
  );
}
