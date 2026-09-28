"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      setMode((localStorage.getItem("fe-theme") as Mode) || "system");
    } catch {
      /* storage blocked — stay on system */
    }
  }, []);
  const next: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
  const label = mode === "system" ? "Theme: match device" : mode === "light" ? "Theme: light" : "Theme: dark";
  return (
    <button
      type="button"
      aria-label={`${label}. Switch to ${next}.`}
      title={label}
      onClick={() => {
        setMode(next);
        try {
          localStorage.setItem("fe-theme", next);
        } catch {
          /* ignore */
        }
        apply(next);
      }}
      className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg", className)}
    >
      <Icon name={mode === "dark" ? "moon" : mode === "light" ? "sun" : "monitor"} size={17} />
    </button>
  );
}
