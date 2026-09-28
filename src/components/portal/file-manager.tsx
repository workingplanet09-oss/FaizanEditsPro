"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateShort, formatTimecode } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Uploader, type UploadedAsset } from "./uploader";

export interface FileRow {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  status: string;
  folderKey: string | null;
  folderName: string | null;
  isDeliverable?: boolean;
  visibleToClient?: boolean;
  hasThumbnail?: boolean;
  durationMs?: number | null;
  uploadedBy?: string | null;
  createdAt: string | Date;
  shared?: boolean;
  project?: { id: string; name: string; code: string } | null;
}

const typeIcon = (m: string) => (m.startsWith("video/") ? "video" : m.startsWith("audio/") ? "music" : m.startsWith("image/") ? "image" : m === "application/pdf" ? "file" : "package");

function Thumb({ file }: { file: FileRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (file.status === "READY" && (file.hasThumbnail || (file.mimeType.startsWith("image/") && file.mimeType !== "image/svg+xml"))) {
      api<{ url: string | null }>(`/api/assets/${file.id}/thumbnail`).then((r) => alive && setUrl(r.url)).catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [file.id, file.status, file.hasThumbnail, file.mimeType]);
  return (
    <span className="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Icon name={typeIcon(file.mimeType)} size={20} />
      )}
      {url && file.mimeType.startsWith("video/") ? <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white"><Icon name="play" size={14} /></span> : null}
    </span>
  );
}

/** Opens a short-lived signed URL. Nothing is proxied through the app server; storage credentials never reach the browser. */
export async function openAsset(id: string, mode: "download" | "inline" = "download") {
  const r = await api<{ url: string }>(`/api/assets/${id}?${mode === "inline" ? "inline=1" : "download=1"}`);
  window.open(r.url, "_blank", "noopener");
}

export function FileManager({
  projectId,
  files,
  folders,
  activeFolder,
  canUpload,
  canDelete,
  canShare,
  currentUserName,
  fileRequests = [],
  basePath,
  extraParams,
  showProject,
  staff = false,
}: {
  projectId?: string;
  files: FileRow[];
  folders?: { key: string; name: string; count: number }[];
  activeFolder?: string;
  canUpload?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  currentUserName?: string;
  fileRequests?: { id: string; title: string; description: string | null; status: string }[];
  basePath?: string;
  extraParams?: Record<string, string | undefined>;
  showProject?: boolean;
  staff?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rename, setRename] = useState<FileRow | null>(null);
  const [name, setName] = useState("");
  const [del, setDel] = useState<FileRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | undefined>();
  void currentUserName;

  const folderHref = (key?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) if (v) sp.set(k, v);
    if (key) sp.set("folder", key);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  const openReqs = fileRequests.filter((r) => r.status === "OPEN");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e: any) {
      toast.error("That didn't work", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {openReqs.length ? (
        <div className="space-y-2">
          {openReqs.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Icon name="upload" size={18} className="mt-0.5 text-warning" />
                <div><div className="text-sm font-bold">Requested: {r.title}</div>{r.description ? <div className="text-xs text-muted">{r.description}</div> : null}</div>
              </div>
              {canUpload ? <Button size="sm" variant="dark" onClick={() => setUploadFor(uploadFor === r.id ? undefined : r.id)}>{uploadFor === r.id ? "Close" : "Upload for this request"}</Button> : null}
            </div>
          ))}
          {uploadFor && projectId ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <Uploader projectId={projectId} fileRequestId={uploadFor} purpose="asset" folderKey="raw-footage" compact onAllDone={() => router.refresh()} />
            </div>
          ) : null}
        </div>
      ) : null}

      {canUpload && projectId ? (
        <Uploader projectId={projectId} purpose="asset" folderKey={activeFolder && activeFolder !== "all" ? activeFolder : "raw-footage"} title="Drag & drop footage, audio, images and documents" hint="Large files upload directly and can be retried" onAllDone={() => router.refresh()} />
      ) : null}

      {folders?.length && basePath ? (
        <nav aria-label="Folders" className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Link href={folderHref()} className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", !activeFolder ? "border-fg bg-fg text-bg" : "border-line-strong hover:bg-surface-2")}>All files</Link>
          {folders.map((f) => (
            <Link key={f.key} href={folderHref(f.key)} className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", activeFolder === f.key ? "border-fg bg-fg text-bg" : "border-line-strong hover:bg-surface-2")}>
              {f.name} <span className={cn("ml-1 text-xs", activeFolder === f.key ? "opacity-70" : "text-subtle")}>{f.count}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!files.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong">
          <EmptyState icon="folder" title="No files here yet" description={canUpload ? "Drop files above to add them to this project." : "Files added to this project will show up here."} />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Thumb file={f} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void openAsset(f.id, /^(video|audio|image)\/|application\/pdf/.test(f.mimeType) ? "inline" : "download").catch((e) => toast.error("Can't open file", e.message))} className="truncate text-left text-sm font-bold hover:text-accent hover:underline">{f.displayName}</button>
                  {f.version > 1 ? <Badge tone="info" dot={false} icon={false}>v{f.version}</Badge> : null}
                  {f.isDeliverable ? <Badge tone={f.visibleToClient ? "success" : "warning"} icon={f.visibleToClient ? "check" : "lock"}>{f.visibleToClient ? "Deliverable" : "Deliverable (unpublished)"}</Badge> : null}
                  {f.status !== "READY" ? <Badge tone={f.status === "QUARANTINED" ? "danger" : "warning"}>{f.status.toLowerCase()}</Badge> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-subtle">
                  <span>{formatBytes(f.sizeBytes)}</span>
                  {f.durationMs ? <span>{formatTimecode(f.durationMs)}</span> : null}
                  {f.folderName ? <span>{f.folderName}</span> : null}
                  <span>{f.uploadedBy ?? "—"} · {formatDateShort(f.createdAt)}</span>
                  {showProject && f.project ? <Link href={`/${staff ? "admin" : "dashboard"}/projects/${f.project.id}`} className="hover:text-fg hover:underline">{f.project.code}</Link> : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" icon="download" onClick={() => void openAsset(f.id).catch((e) => toast.error("Can't download", e.message))} aria-label={`Download ${f.displayName}`}><span className="hidden sm:inline">Download</span></Button>
                {canShare && !f.isDeliverable ? (
                  <Button size="sm" variant="ghost" icon="link" aria-label="Copy share link" onClick={() => void run(async () => { const r = await api<{ url: string }>(`/api/assets/${f.id}/share`, { body: {} }); await navigator.clipboard?.writeText(r.url).catch(() => {}); }, "Share link copied")} />
                ) : null}
                {canUpload ? <Button size="sm" variant="ghost" icon="pencil" aria-label={`Rename ${f.displayName}`} onClick={() => (setRename(f), setName(f.displayName))} /> : null}
                {canDelete ? <Button size="sm" variant="ghost" icon="trash" aria-label={`Delete ${f.displayName}`} onClick={() => setDel(f)} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!rename} onClose={() => setRename(null)} title="Rename file" size="sm" footer={<><Button variant="ghost" onClick={() => setRename(null)}>Cancel</Button><Button loading={busy} onClick={() => rename && void run(async () => { await api(`/api/assets/${rename.id}`, { method: "PATCH", body: { displayName: name } }); setRename(null); }, "File renamed")}>Save</Button></>}>
        <label className="text-sm font-semibold" htmlFor="rename-file">File name</label>
        <Input id="rename-file" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" autoFocus />
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} tone="danger" loading={busy} title="Delete this file?" description={del ? `“${del.displayName}” will be removed from the project. This can't be undone.` : undefined} confirmLabel="Delete file" onConfirm={async () => { if (del) await run(async () => { await api(`/api/assets/${del.id}`, { method: "DELETE" }); setDel(null); }, "File deleted"); }} />
    </div>
  );
}
export type { UploadedAsset };
