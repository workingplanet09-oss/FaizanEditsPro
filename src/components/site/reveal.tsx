"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Fades content up once as it enters the viewport. Renders visible immediately if JS/IntersectionObserver is unavailable. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: React.ElementType }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} style={{ animationDelay: `${delay}ms` }} className={cn(shown ? "animate-fade-up" : "opacity-0", className)}>
      {children}
    </Tag>
  );
}
