"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Side-by-side before/after with a single shared play control so the two stay in sync. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const vids = [a.current, b.current];
    if (!playing) {
      vids.forEach((v) => v && (v.currentTime = a.current?.currentTime ?? 0));
      vids.forEach((v) => void v?.play());
    } else vids.forEach((v) => v?.pause());
    setPlaying(!playing);
  };
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { label: "Before", src: before, ref: a },
          { label: "After", src: after, ref: b },
        ].map((v) => (
          <figure key={v.label} className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={v.ref} src={v.src} muted={v.label === "Before"} playsInline loop preload="metadata" className="aspect-video w-full object-cover" />
            <figcaption className={cn("absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold", v.label === "After" ? "bg-accent text-accent-fg" : "bg-black/70 text-white")}>{v.label}</figcaption>
          </figure>
        ))}
      </div>
      <button type="button" onClick={toggle} className="mt-3 rounded-xl bg-fg px-5 py-2.5 text-sm font-bold text-bg hover:opacity-90">
        {playing ? "Pause both" : "Play both"}
      </button>
    </div>
  );
}
