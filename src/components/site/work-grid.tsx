"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { BeforeAfter } from "./before-after";

export interface WorkItem {
  id: string;
  slug: string;
  title: string;
  clientName: string | null;
  industry: string | null;
  category: string;
  projectType: string | null;
  platforms: string[];
  thumbnailUrl: string | null;
  videoUrl: string | null;
  beforeVideoUrl: string | null;
  afterVideoUrl: string | null;
  description: string | null;
  caseStudySlug: string | null;
  isDemo: boolean;
}

function embed(url: string) {
  if (/youtube\.com|youtu\.be/.test(url)) return `https://www.youtube-nocookie.com/embed/${url.split(/v=|youtu\.be\/|embed\//).pop()?.split(/[?&]/)[0]}?rel=0`;
  if (/vimeo\.com/.test(url)) return url.replace("vimeo.com/", "player.vimeo.com/video/");
  return null;
}

export function WorkGrid({ items, categories }: { items: WorkItem[]; categories: string[] }) {
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<WorkItem | null>(null);
  const shown = useMemo(() => (cat === "All" ? items : items.filter((i) => i.category === cat)), [items, cat]);

  return (
    <>
      <div role="tablist" aria-label="Filter work by category" className="scroll-x -mx-1 mb-8 flex gap-2 px-1 pb-2">
        {["All", ...categories].map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} type="button" onClick={() => setCat(c)} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition", cat === c ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-subtle hover:text-fg")}>
            {c}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">No projects in this category yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <li key={w.id} id={w.slug} className="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">
              <button type="button" onClick={() => setOpen(w)} className="relative block aspect-video w-full overflow-hidden bg-surface-2 text-left" aria-label={`Open ${w.title}`}>
                {w.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_30%,var(--surface-2)),var(--surface-2))]">
                    <Icon name="film" size={40} className="text-subtle" />
                  </span>
                )}
                {w.videoUrl ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                    <span className="flex h-14 w-14 scale-90 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-xl transition group-hover:scale-100 group-hover:opacity-100">
                      <Icon name="play" size={22} className="ml-0.5" />
                    </span>
                  </span>
                ) : null}
                {w.beforeVideoUrl && w.afterVideoUrl ? <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">Before / After</span> : null}
                {w.isDemo ? <span className="absolute right-3 top-3 rounded-full bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase text-warning-fg">Demo</span> : null}
              </button>
              <div className="p-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge tone="neutral" icon={false}>{w.category}</Badge>
                  {w.projectType ? <Badge tone="neutral" icon={false}>{w.projectType}</Badge> : null}
                </div>
                <h3 className="text-base font-extrabold leading-snug">{w.title}</h3>
                <p className="mt-1 text-sm text-muted">{[w.clientName, w.industry].filter(Boolean).join(" · ")}</p>
                {w.platforms.length ? <p className="mt-3 text-xs text-subtle">{w.platforms.join(" · ")}</p> : null}
                {w.caseStudySlug ? (
                  <Link href={`/case-studies/${w.caseStudySlug}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold hover:text-accent-text">
                    View case study <Icon name="arrow" size={14} />
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} description={[open?.clientName, open?.industry].filter(Boolean).join(" · ")} size="lg">
        {open ? (
          <div className="space-y-4">
            {open.beforeVideoUrl && open.afterVideoUrl ? (
              <BeforeAfter before={open.beforeVideoUrl} after={open.afterVideoUrl} />
            ) : open.videoUrl ? (
              embed(open.videoUrl) ? (
                <iframe src={embed(open.videoUrl)!} title={open.title} allow="fullscreen; picture-in-picture" className="aspect-video w-full rounded-2xl" loading="lazy" />
              ) : (
                <video src={open.videoUrl} controls playsInline poster={open.thumbnailUrl ?? undefined} className="aspect-video w-full rounded-2xl bg-black" preload="metadata" />
              )
            ) : (
              <p className="rounded-xl bg-surface-2 p-6 text-center text-sm text-muted">No preview available for this project yet.</p>
            )}
            {open.description ? <p className="text-sm leading-relaxed text-muted">{open.description}</p> : null}
            {open.caseStudySlug ? (
              <Link href={`/case-studies/${open.caseStudySlug}`} className="inline-flex items-center gap-1.5 font-bold hover:text-accent-text">
                Read the full case study <Icon name="arrow" size={14} />
              </Link>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
