"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { formatTimecode, timeAgo } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/primitives";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { REVISION_STATUS_META, STATUS_META, type ProjectStatusKey } from "@/lib/statuses";
import type { CommentDTO, VersionDTO } from "@/server/services/reviews";

export interface ReviewPerms {
  canComment: boolean;
  canApprove: boolean;
  canRequestRevision: boolean;
  canTriage: boolean;
  canRelease?: boolean;
}
export interface PlaybackInfo {
  url: string | null;
  external: boolean;
  mimeType?: string;
  error?: string | null;
}
interface Props {
  base: "/dashboard" | "/admin" | "/editor";
  staff: boolean;
  me: { id: string; name: string };
  project: { id: string; name: string; code: string; status: ProjectStatusKey; revisionLimit: number; revisionsUsed: number };
  versions: VersionDTO[];
  current: VersionDTO;
  comments: CommentDTO[];
  perms: ReviewPerms;
  playback: PlaybackInfo;
  posterUrl: string | null;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VERSION_STATUS: Record<string, { label: string; tone: "warning" | "success" | "neutral" | "info" }> = {
  PENDING_CLIENT: { label: "Awaiting client review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "info" },
  SUPERSEDED: { label: "Replaced by newer version", tone: "neutral" },
  DRAFT: { label: "Team-only draft", tone: "neutral" },
  INTERNAL_REVIEW: { label: "Internal review", tone: "neutral" },
};

export function ReviewPlayer({ base, staff, me, project, versions, current, comments: initialComments, perms, playback, posterUrl }: Props) {
  const router = useRouter();
  const toast = useToast();
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const video2 = useRef<HTMLVideoElement>(null);
  const scrub = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0); // ms
  const [dur, setDur] = useState(current.durationMs ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [full, setFull] = useState(false);
  const [ready, setReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [comments, setComments] = useState<CommentDTO[]>(initialComments);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [text, setText] = useState("");
  const [pin, setPin] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  useEffect(() => setComments(initialComments), [initialComments]);

  // ───── playback wiring ─────
  const sync = useCallback(() => {
    const v = video.current;
    if (!v) return;
    setTime(Math.round(v.currentTime * 1000));
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1) * 1000);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (video.current && !video.current.paused) sync();
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const seek = useCallback((ms: number) => {
    const v = video.current;
    if (!v) return;
    const max = (v.duration || dur / 1000 || 0) * 1000;
    const t = Math.max(0, Math.min(ms, max || ms));
    v.currentTime = t / 1000;
    if (video2.current) video2.current.currentTime = t / 1000;
    setTime(t);
  }, [dur]);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setVideoError(true));
    else v.pause();
  }, []);

  // keep the comparison video locked to the main one
  useEffect(() => {
    const a = video.current;
    const b = video2.current;
    if (!a || !b || !compareId) return;
    const play = () => void b.play().catch(() => {});
    const pause = () => b.pause();
    const seeked = () => (b.currentTime = a.currentTime);
    const rateCh = () => (b.playbackRate = a.playbackRate);
    a.addEventListener("play", play);
    a.addEventListener("pause", pause);
    a.addEventListener("seeked", seeked);
    a.addEventListener("ratechange", rateCh);
    b.muted = true;
    return () => {
      a.removeEventListener("play", play);
      a.removeEventListener("pause", pause);
      a.removeEventListener("seeked", seeked);
      a.removeEventListener("ratechange", rateCh);
    };
  }, [compareId, compareUrl]);

  useEffect(() => {
    if (!compareId) return setCompareUrl(null);
    let alive = true;
    api<{ url: string }>(`/api/video-versions/${compareId}/playback`).then((r) => alive && setCompareUrl(r.url)).catch(() => alive && (toast.error("Can't load that version"), setCompareId(null)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareId]);

  // ───── keyboard ─────
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT") return;
    const step = e.shiftKey ? 1000 : 5000;
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        toggle();
        break;
      case "j":
        seek(time - 10000);
        break;
      case "l":
        seek(time + 10000);
        break;
      case "ArrowLeft":
        e.preventDefault();
        seek(time - step);
        break;
      case "ArrowRight":
        e.preventDefault();
        seek(time + step);
        break;
      case ",":
        video.current?.pause();
        seek(time - 42);
        break;
      case ".":
        video.current?.pause();
        seek(time + 42);
        break;
      case "ArrowUp":
        e.preventDefault();
        setVol(Math.min(1, volume + 0.1));
        break;
      case "ArrowDown":
        e.preventDefault();
        setVol(Math.max(0, volume - 0.1));
        break;
      case "m":
        setMute(!muted);
        break;
      case "f":
        void toggleFull();
        break;
      case "c":
        if (perms.canComment) {
          e.preventDefault();
          composer.current?.focus();
        }
        break;
    }
  };
  function setVol(v: number) {
    setVolume(v);
    if (video.current) video.current.volume = v;
    if (v > 0 && muted) setMute(false);
  }
  function setMute(m: boolean) {
    setMuted(m);
    if (video.current) video.current.muted = m;
  }
  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await stage.current?.requestFullscreen?.().catch(() => {});
  }
  function setSpeed(r: number) {
    setRate(r);
    if (video.current) video.current.playbackRate = r;
  }

  // ───── scrubber ─────
  const fromPointer = (clientX: number) => {
    const r = scrub.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!dur) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    seek(fromPointer(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => dragging && seek(fromPointer(e.clientX));
  const onPointerUp = () => setDragging(false);

  // ───── comments ─────
  const roots = useMemo(() => comments.filter((c) => !c.parentId).sort((a, b) => a.timecodeMs - b.timecodeMs || +new Date(a.createdAt) - +new Date(b.createdAt)), [comments]);
  const repliesOf = useMemo(() => {
    const m = new Map<string, CommentDTO[]>();
    for (const c of comments) if (c.parentId) m.set(c.parentId, [...(m.get(c.parentId) ?? []), c]);
    for (const v of m.values()) v.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return m;
  }, [comments]);
  const shown = roots.filter((c) => (filter === "open" ? ["OPEN", "IN_PROGRESS"].includes(c.status) : filter === "resolved" ? ["RESOLVED", "REJECTED", "CLOSED"].includes(c.status) : true));
  const openCount = roots.filter((c) => ["OPEN", "IN_PROGRESS"].includes(c.status)).length;
  const activeId = useMemo(() => {
    let best: CommentDTO | null = null;
    for (const c of roots) if (c.timecodeMs <= time + 250 && time - c.timecodeMs < 5000) best = c;
    return best?.id ?? null;
  }, [roots, time]);
  useEffect(() => {
    if (!playing || !activeId) return;
    document.getElementById(`c-${activeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, playing]);

  const add = useAction(
    async (body: { timecodeMs: number; comment: string; parentId?: string }) => api<CommentDTO>(`/api/video-versions/${current.id}/comments`, { body }),
    {
      refresh: false,
      onSuccess: (c) => {
        setComments((p) => [...p, c]);
        toast.success(c.parentId ? "Reply added" : `Comment added at ${c.timecode}`);
      },
      onError: (e) => toast.error("Comment not saved", e.message),
    },
  );
  async function submitComment() {
    if (!text.trim()) return;
    const r = await add.run({ timecodeMs: pin ?? time, comment: text.trim() });
    if (r) {
      setText("");
      setPin(null);
    }
  }
  async function submitReply(c: CommentDTO) {
    if (!replyText.trim()) return;
    const r = await add.run({ timecodeMs: c.timecodeMs, comment: replyText.trim(), parentId: c.id });
    if (r) {
      setReplyText("");
      setReplyTo(null);
    }
  }
  const setStatus = useAction(async (id: string, status: string) => api<CommentDTO>(`/api/video-comments/${id}`, { method: "PATCH", body: { status } }), {
    refresh: false,
    onSuccess: (c) => setComments((p) => p.map((x) => (x.id === c.id ? c : x))),
    onError: (e) => toast.error("Couldn't update the note", e.message),
  });
  const release = useAction(async () => api(`/api/video-versions/${current.id}/release`, { body: {} }), { onSuccess: () => toast.success("Released to the client") });

  const vStatus = VERSION_STATUS[current.reviewStatus] ?? { label: current.reviewStatus, tone: "neutral" as const };
  const others = versions.filter((v) => v.id !== current.id);
  const meta = STATUS_META[project.status];

  return (
    <div className="-mx-4 sm:mx-0">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 px-4 sm:px-0">
        <div className="min-w-0">
          <Link href={`${base}/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> {project.name}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{current.label}{current.isFinal ? " · Final" : ""}</h1>
            <Badge tone={vStatus.tone}>{vStatus.label}</Badge>
            <span className="text-xs text-subtle">{project.code} · uploaded {timeAgo(current.releasedAt ?? current.createdAt)}{current.createdBy ? ` by ${current.createdBy}` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="version-select">Version</label>
          <select id="version-select" value={current.id} onChange={(e) => router.push(`${base}/projects/${project.id}/review/${e.target.value}`)} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">
            {versions.map((v) => <option key={v.id} value={v.id}>{v.label}{v.isFinal ? " (final)" : ""} — {VERSION_STATUS[v.reviewStatus]?.label ?? v.reviewStatus}</option>)}
          </select>
          {others.length ? (
            compareId ? (
              <Button variant="outline" icon="x" onClick={() => setCompareId(null)}>Stop comparing</Button>
            ) : (
              <label className="relative">
                <span className="sr-only">Compare with another version</span>
                <select value="" onChange={(e) => e.target.value && setCompareId(e.target.value)} className="h-10 appearance-none rounded-xl border border-line-strong bg-surface pl-9 pr-8 text-sm font-semibold">
                  <option value="">Compare…</option>
                  {others.map((v) => <option key={v.id} value={v.id}>vs {v.label}</option>)}
                </select>
                <Icon name="layers" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              </label>
            )
          ) : null}
          {perms.canRelease ? <Button variant="dark" icon="send" loading={release.pending} onClick={() => void release.run()}>Release to client</Button> : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ───── player ───── */}
        <div>
          <div
            ref={stage}
            tabIndex={0}
            onKeyDown={onKey}
            aria-label="Video player. Space plays or pauses, arrow keys seek, C adds a comment."
            className={cn("group/player relative overflow-hidden bg-black outline-none focus-visible:ring-4 focus-visible:ring-accent/40 sm:rounded-[var(--radius-card)]", full && "flex h-full flex-col justify-center")}
          >
            <div className={cn("grid", compareId ? "sm:grid-cols-2" : "grid-cols-1")}>
              <div className="relative">
                {compareId ? <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">{current.label}</span> : null}
                {playback.url && !playback.external && !videoError ? (
                  <video
                    ref={video}
                    src={playback.url}
                    poster={posterUrl ?? undefined}
                    playsInline
                    preload="metadata"
                    className={cn("aspect-video w-full bg-black", full && "max-h-[calc(100vh-7rem)]")}
                    onClick={toggle}
                    onPlay={() => setPlaying(true)}
                    onPause={() => (setPlaying(false), sync())}
                    onEnded={() => setPlaying(false)}
                    onSeeked={sync}
                    onTimeUpdate={sync}
                    onLoadedMetadata={(e) => {
                      setDur(Math.round(e.currentTarget.duration * 1000));
                      setReady(true);
                    }}
                    onProgress={sync}
                    onError={() => setVideoError(true)}
                  />
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-neutral-900 px-6 text-center text-white">
                    <Icon name={videoError ? "warning" : "film"} size={30} />
                    {playback.external && playback.url ? (
                      <>
                        <p className="text-sm text-white/80">This version is hosted externally.</p>
                        <a href={playback.url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black">Open video ↗</a>
                        <p className="text-xs text-white/60">Note the timecode you're commenting on and enter it below.</p>
                      </>
                    ) : (
                      <>
                        <p className="max-w-sm text-sm text-white/80">{videoError ? "This video couldn't be loaded. It may still be processing, or the secure link expired." : playback.error || "This version has no playable video yet."}</p>
                        <button type="button" onClick={() => router.refresh()} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black">Try again</button>
                      </>
                    )}
                  </div>
                )}
                {!playing && ready && !videoError ? (
                  <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/25">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lift"><Icon name="play" size={26} className="ml-1" /></span>
                  </button>
                ) : null}
              </div>
              {compareId ? (
                <div className="relative border-t border-white/10 sm:border-l sm:border-t-0">
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">{versions.find((v) => v.id === compareId)?.label}</span>
                  {compareUrl ? <video ref={video2} src={compareUrl} muted playsInline preload="metadata" className="aspect-video w-full bg-black" /> : <div className="flex aspect-video items-center justify-center text-sm text-white/70">Loading…</div>}
                </div>
              ) : null}
            </div>

            {/* controls */}
            <div className="bg-neutral-950 px-3 pb-3 pt-2 text-white sm:px-4">
              <div
                ref={scrub}
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(dur / 1000)}
                aria-valuenow={Math.round(time / 1000)}
                aria-valuetext={`${formatTimecode(time)} of ${formatTimecode(dur)}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    seek(time + (e.key === "ArrowRight" ? 5000 : -5000));
                  }
                }}
                className="group/scrub relative flex h-7 cursor-pointer touch-none items-center"
              >
                <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all group-hover/scrub:h-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${dur ? Math.min(100, (time / dur) * 100) : 0}%` }} />
                </div>
                <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${dur ? Math.min(100, (time / dur) * 100) : 0}%` }} />
                {roots.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`Comment at ${c.timecode}: ${c.comment.slice(0, 60)}`}
                    title={`${c.timecode} · ${c.author}: ${c.comment.slice(0, 80)}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(c.timecodeMs);
                      document.getElementById(`c-${c.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }}
                    className={cn("absolute top-0 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-black/40 transition hover:scale-150", c.status === "RESOLVED" ? "bg-emerald-400" : c.isStaff ? "bg-sky-400" : "bg-amber-300")}
                    style={{ left: `${dur ? Math.min(100, (c.timecodeMs / dur) * 100) : 0}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                <CtlBtn label={playing ? "Pause" : "Play"} onClick={toggle} icon={playing ? "pause" : "play"} />
                <CtlBtn label="Back 10 seconds" onClick={() => seek(time - 10000)} icon="refresh" flip />
                <span className="px-1 font-mono text-xs tabular-nums text-white/90 sm:text-sm" aria-hidden>{formatTimecode(time)} <span className="text-white/50">/ {formatTimecode(dur)}</span></span>
                <span className="ml-auto flex items-center gap-1">
                  <span className="hidden items-center gap-1 sm:flex">
                    <CtlBtn label={muted || volume === 0 ? "Unmute" : "Mute"} onClick={() => setMute(!muted)} icon={muted || volume === 0 ? "x" : "music"} />
                    <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => setVol(Number(e.target.value))} aria-label="Volume" className="h-1 w-20 accent-[var(--accent)]" />
                  </span>
                  <label className="sr-only" htmlFor="speed">Playback speed</label>
                  <select id="speed" value={rate} onChange={(e) => setSpeed(Number(e.target.value))} className="h-8 rounded-lg border border-white/15 bg-transparent px-1.5 text-xs font-semibold text-white">
                    {SPEEDS.map((s) => <option key={s} value={s} className="text-black">{s}×</option>)}
                  </select>
                  <CtlBtn label={full ? "Exit full screen" : "Full screen"} onClick={() => void toggleFull()} icon="monitor" />
                </span>
              </div>
            </div>
          </div>

          {current.notes || current.changeSummary ? (
            <div className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-4 sm:mx-0">
              {current.changeSummary ? <p className="text-sm"><b>What changed:</b> {current.changeSummary}</p> : null}
              {current.notes ? <p className={cn("text-sm text-muted", current.changeSummary && "mt-1.5")}><b className="text-fg">Editor's note:</b> {current.notes}</p> : null}
            </div>
          ) : null}

          {/* decisions */}
          {(perms.canApprove || perms.canRequestRevision) ? (
            <div className="mx-4 mt-4 rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft/50 p-5 sm:mx-0">
              <h2 className="text-base font-extrabold">Ready to decide on {current.label}?</h2>
              <p className="mt-1 text-sm text-muted">{meta.clientNext} You've used {project.revisionsUsed} of {project.revisionLimit} included revision rounds.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {perms.canApprove ? <Button size="lg" icon="check-circle" onClick={() => setApproveOpen(true)}>Approve {current.label}</Button> : null}
                {perms.canRequestRevision ? <Button size="lg" variant="outline" icon="refresh" onClick={() => setChangesOpen(true)}>Request changes{openCount ? ` (${openCount} note${openCount === 1 ? "" : "s"})` : ""}</Button> : null}
              </div>
            </div>
          ) : current.reviewStatus === "APPROVED" ? (
            <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft/50 p-4 text-sm sm:mx-0"><Icon name="check-circle" size={20} className="mt-0.5 shrink-0 text-success" /><div><b>Approved{current.approvedBy ? ` by ${current.approvedBy}` : ""}.</b> {current.approvalNotes ? <>“{current.approvalNotes}” </> : null}<span className="text-muted">Final files unlock once payment conditions are met.</span></div></div>
          ) : null}
        </div>

        {/* ───── comments ───── */}
        <aside className="flex min-h-0 flex-col px-4 sm:px-0 lg:h-[calc(100vh-11rem)] lg:min-h-[32rem]" aria-label="Comments">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold">Notes <span className="text-sm font-semibold text-subtle">({roots.length})</span></h2>
            <div role="tablist" aria-label="Filter notes" className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
              {(["all", "open", "resolved"] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded-md px-2.5 py-1 capitalize transition", filter === f ? "bg-surface shadow-soft" : "text-muted hover:text-fg")}>{f}</button>
              ))}
            </div>
          </div>

          {perms.canComment ? (
            <div className="mb-3 rounded-2xl border border-line-strong bg-surface p-3 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-bold"><Icon name="clock" size={13} />Comment at <button type="button" className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono font-bold hover:underline" onClick={() => setPin(null)} title="Use the current playhead time">{formatTimecode(pin ?? time)}</button></span>
                {pin !== null ? <button type="button" onClick={() => setPin(null)} className="text-subtle hover:text-fg">Follow playhead</button> : <span className="text-subtle">follows playhead</span>}
              </div>
              <label htmlFor="new-comment" className="sr-only">Add a timestamped comment</label>
              <textarea
                id="new-comment"
                ref={composer}
                value={text}
                rows={3}
                maxLength={2000}
                placeholder="What should change at this moment?"
                onFocus={() => {
                  if (pin === null && !text) {
                    video.current?.pause();
                    setPin(time);
                  }
                }}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                className="w-full resize-none rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-sm focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/20"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-subtle">Ctrl/⌘+Enter to post</span>
                <Button size="sm" icon="send" loading={add.pending} disabled={!text.trim()} onClick={() => void submitComment()}>Add note</Button>
              </div>
            </div>
          ) : (
            <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
              {current.reviewStatus === "APPROVED" ? "This version is approved, so it's closed for new notes." : current.reviewStatus === "SUPERSEDED" ? "A newer version replaced this one. Add notes on the latest version." : !staff && current.reviewStatus === "CHANGES_REQUESTED" ? "Your notes were sent. We'll upload a new version soon." : "Notes can't be added right now."}
            </p>
          )}

          <div ref={list} className="thin-scroll -mr-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-2 pb-4">
            {!shown.length ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center">
                <Icon name="message" size={22} className="mx-auto text-subtle" />
                <p className="mt-2 text-sm font-semibold">{roots.length ? "No notes match this filter" : "No notes yet"}</p>
                {!roots.length ? <p className="mx-auto mt-1 max-w-[16rem] text-xs text-muted">{perms.canComment ? "Pause the video where you want a change and add a note. It's saved with the exact timestamp." : "Feedback added on this version will show up here."}</p> : null}
              </div>
            ) : (
              shown.map((c) => {
                const replies = repliesOf.get(c.id) ?? [];
                const st = REVISION_STATUS_META[c.status] ?? { label: c.status, tone: "neutral" as const };
                const mine = c.authorId === me.id;
                return (
                  <article key={c.id} id={`c-${c.id}`} className={cn("rounded-2xl border bg-surface p-3.5 transition", activeId === c.id ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-line", ["RESOLVED", "CLOSED", "REJECTED"].includes(c.status) && "opacity-75")}>
                    <div className="flex items-start gap-2.5">
                      <button type="button" onClick={() => seek(c.timecodeMs)} className="mt-0.5 shrink-0 rounded-lg bg-fg px-2 py-1 font-mono text-xs font-bold text-bg hover:bg-accent hover:text-accent-fg" aria-label={`Jump to ${c.timecode}`}>{c.timecode}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-xs"><b>{mine ? "You" : c.author}</b>{c.isStaff ? <span className="rounded bg-accent-soft px-1 py-0.5 text-[10px] font-bold uppercase">Studio</span> : null}<span className="text-subtle">{timeAgo(c.createdAt)}</span></div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug">{c.comment}</p>
                      </div>
                      <Badge tone={st.tone} dot={false} icon={false} className="shrink-0">{st.label}</Badge>
                    </div>

                    {replies.length ? (
                      <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
                        {replies.map((r) => (
                          <li key={r.id} className="text-sm"><div className="text-xs"><b>{r.authorId === me.id ? "You" : r.author}</b>{r.isStaff ? <span className="ml-1.5 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-bold uppercase">Studio</span> : null}<span className="ml-2 text-subtle">{timeAgo(r.createdAt)}</span></div><p className="mt-0.5 whitespace-pre-wrap break-words">{r.comment}</p></li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs font-semibold">
                      {perms.canComment || staff ? <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">Reply</button> : null}
                      {perms.canTriage ? (
                        <>
                          {c.status !== "RESOLVED" ? <button type="button" onClick={() => void setStatus.run(c.id, "RESOLVED")} className="rounded-md px-2 py-1 text-success hover:bg-success-soft">Resolve</button> : <button type="button" onClick={() => void setStatus.run(c.id, "OPEN")} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Reopen</button>}
                          {c.status === "OPEN" ? <button type="button" onClick={() => void setStatus.run(c.id, "IN_PROGRESS")} className="rounded-md px-2 py-1 text-info hover:bg-info-soft">Start</button> : null}
                          {c.status !== "REJECTED" ? <button type="button" onClick={() => void setStatus.run(c.id, "REJECTED")} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2" title="Won't do — explain in a reply">Won't do</button> : null}
                        </>
                      ) : mine && perms.canComment ? (
                        c.status === "OPEN" ? <button type="button" onClick={() => void setStatus.run(c.id, "CLOSED")} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Withdraw</button> : c.status === "CLOSED" ? <button type="button" onClick={() => void setStatus.run(c.id, "OPEN")} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2">Reopen</button> : null
                      ) : null}
                    </div>

                    {replyTo === c.id ? (
                      <div className="mt-2 flex items-end gap-2">
                        <label className="sr-only" htmlFor={`reply-${c.id}`}>Reply</label>
                        <textarea id={`reply-${c.id}`} autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} placeholder="Write a reply…" className="flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                        <Button size="sm" loading={add.pending} disabled={!replyText.trim()} onClick={() => void submitReply(c)}>Reply</Button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </aside>
      </div>

      <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} projectId={project.id} version={current} base={base} />
      <ChangesModal open={changesOpen} onClose={() => setChangesOpen(false)} projectId={project.id} version={current} openNotes={openCount} used={project.revisionsUsed} limit={project.revisionLimit} base={base} />
    </div>
  );
}

function CtlBtn({ label, icon, onClick, flip }: { label: string; icon: string; onClick: () => void; flip?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/10 hover:text-white">
      <Icon name={icon} size={18} className={flip ? "-scale-x-100" : undefined} />
    </button>
  );
}

function ApproveModal({ open, onClose, projectId, version, base }: { open: boolean; onClose: () => void; projectId: string; version: VersionDTO; base: string }) {
  const router = useRouter();
  const toast = useToast();
  const [sure, setSure] = useState(false);
  const [notes, setNotes] = useState("");
  const go = useAction(async () => api(`/api/projects/${projectId}/approve`, { body: { versionId: version.id, confirmVersionNumber: version.versionNumber, notes: notes || undefined } }), {
    refresh: false,
    onSuccess: () => {
      toast.success(`${version.label} approved`, "We're preparing your final files.");
      onClose();
      router.push(`${base}/projects/${projectId}?tab=delivery`);
      router.refresh();
    },
  });
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Approve ${version.label}?`} description="This tells us the edit is final. It's recorded with your name, the time and this exact version." footer={<><Button variant="ghost" onClick={onClose}>Not yet</Button><Button icon="check-circle" loading={go.pending} disabled={!sure} onClick={() => void go.run()}>Approve {version.label}</Button></>}>
      <div className="space-y-4">
        {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{go.error}</p> : null}
        <Checkbox checked={sure} onChange={(e) => setSure(e.target.checked)} label={`I've watched ${version.label} and approve it as final`} description="Further changes after approval may be treated as a new request." />
        <Field label="Note for the team">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — anything you'd like us to know" />}</Field>
        <p className="text-xs text-subtle">Final files unlock when any remaining balance is paid. You'll get an invoice right after approving if one is due.</p>
      </div>
    </Modal>
  );
}

function ChangesModal({ open, onClose, projectId, version, openNotes, used, limit, base }: { open: boolean; onClose: () => void; projectId: string; version: VersionDTO; openNotes: number; used: number; limit: number; base: string }) {
  const router = useRouter();
  const toast = useToast();
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const go = useAction(async () => api(`/api/revisions`, { body: { projectId, versionId: version.id, description: desc || undefined, priority } }), {
    refresh: false,
    onSuccess: () => {
      toast.success("Changes requested", "Your notes are with the editor.");
      onClose();
      router.push(`${base}/projects/${projectId}`);
      router.refresh();
    },
  });
  const over = used >= limit;
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Send your notes to the editor" description={`${openNotes} timestamped note${openNotes === 1 ? "" : "s"} on ${version.label} will be sent as one revision round.`} footer={<><Button variant="ghost" onClick={onClose}>Keep reviewing</Button><Button icon="send" loading={go.pending} disabled={!openNotes && desc.trim().length < 5} onClick={() => void go.run()}>Send changes</Button></>}>
      <div className="space-y-4">
        {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{go.error}</p> : null}
        <div className={cn("flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm", over ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted")}>
          <Icon name={over ? "warning" : "info"} size={16} className="mt-0.5 shrink-0" />
          <span>{over ? <>You've used all {limit} included revision rounds. Extra rounds may be quoted — we'll confirm before doing any additional work.</> : <>This is revision round {used + 1} of {limit} included.</>}</span>
        </div>
        {!openNotes ? <p className="text-sm text-muted">You haven't added any timestamped notes, so describe what should change below.</p> : null}
        <Field label="Overall message">{(p) => <Textarea {...p} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Anything that doesn't belong to a single moment — pacing, music, tone…" />}</Field>
        <Field label="Priority">{(p) => (
          <select {...p} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm">
            <option value="NORMAL">Normal</option><option value="HIGH">High — needed soon</option><option value="URGENT">Urgent — deadline at risk</option>
          </select>
        )}</Field>
      </div>
    </Modal>
  );
}
