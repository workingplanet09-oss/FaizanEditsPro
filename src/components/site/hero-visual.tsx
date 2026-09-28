"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

interface FloatingCard {
  icon: string;
  title: string;
  sub: string;
}

const POS = [
  "left-[-3%] top-[8%] sm:left-[-9%]",
  "right-[-2%] top-[-4%] sm:right-[-7%]",
  "left-[2%] bottom-[-5%] sm:left-[-6%]",
  "right-[2%] bottom-[10%] sm:right-[-8%]",
];
const DELAY = ["0s", "-2s", "-4s", "-1s"];

/** Decorative "editor timeline" — animated, abstract, contains no invented footage or numbers. */
function TimelineArt() {
  const tracks = [
    { w: [22, 30, 18, 24], c: "bg-accent" },
    { w: [30, 14, 34, 16], c: "bg-fg/80" },
    { w: [16, 26, 22, 28], c: "bg-fg/35" },
    { w: [40, 20, 26], c: "bg-accent/55" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col bg-[radial-gradient(90%_120%_at_20%_0%,color-mix(in_srgb,var(--accent)_28%,#0b0b0d),#08080a_60%)]">
      <div className="relative flex-1">
        <div className="absolute inset-6 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.01))]" />
        <div className="absolute inset-6 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20">
            <Icon name="play" size={26} className="ml-0.5 text-white" />
          </div>
        </div>
        <div className="absolute bottom-8 left-8 flex items-center gap-2 font-mono text-[11px] text-white/60">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> 00:00:14:08
        </div>
        <div className="absolute right-8 top-8 rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70 backdrop-blur">4K · 24fps</div>
      </div>
      <div className="relative border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
        <div className="space-y-1.5">
          {tracks.map((t, i) => (
            <div key={i} className="flex gap-1">
              {t.w.map((w, j) => (
                <div key={j} style={{ width: `${w}%` }} className={cn("h-2.5 rounded-[4px]", t.c)} />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-y-2 w-px animate-playhead bg-white shadow-[0_0_12px_2px_rgba(255,255,255,.55)]">
          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}

export function HeroVisual({ showreelUrl, posterUrl, cards }: { showreelUrl?: string; posterUrl?: string; cards: FloatingCard[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const isEmbed = !!showreelUrl && /youtube|youtu\.be|vimeo/.test(showreelUrl);
  const embedSrc = showreelUrl
    ? showreelUrl.includes("youtube") || showreelUrl.includes("youtu.be")
      ? `https://www.youtube-nocookie.com/embed/${showreelUrl.split(/v=|youtu\.be\/|embed\//).pop()?.split(/[?&]/)[0]}?autoplay=1&rel=0`
      : showreelUrl.replace("vimeo.com/", "player.vimeo.com/video/") + "?autoplay=1"
    : "";

  return (
    <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
      <div className="relative aspect-[16/11] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-[0_40px_120px_-30px_color-mix(in_srgb,var(--accent)_55%,transparent)] ring-1 ring-white/5">
        {showreelUrl ? (
          playing ? (
            isEmbed ? (
              <iframe src={embedSrc} title="Studio showreel" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" className="absolute inset-0 h-full w-full" />
            ) : (
              <video ref={video} src={showreelUrl} controls autoPlay playsInline className="absolute inset-0 h-full w-full bg-black object-cover" />
            )
          ) : (
            <button type="button" onClick={() => setPlaying(true)} aria-label="Play the studio showreel" className="group absolute inset-0 block w-full">
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
              ) : (
                <TimelineArt />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-fg shadow-2xl transition group-hover:scale-105">
                  <Icon name="play" size={30} className="ml-1" />
                </span>
              </span>
            </button>
          )
        ) : (
          <TimelineArt />
        )}
      </div>
      {cards.slice(0, 4).map((c, i) => (
        <div key={c.title} style={{ animationDelay: DELAY[i] }} className={cn("absolute z-10 hidden animate-float items-center gap-3 rounded-2xl border border-white/10 bg-[#111114]/85 px-3.5 py-3 text-white shadow-2xl backdrop-blur-xl sm:flex", POS[i])}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/90 text-accent-fg">
            <Icon name={c.icon} size={17} />
          </span>
          <span>
            <span className="block text-[13px] font-bold leading-tight">{c.title}</span>
            <span className="block text-[11px] text-white/55">{c.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
