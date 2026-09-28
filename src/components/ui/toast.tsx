"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const Ctx = createContext<{ toast: (t: Omit<ToastItem, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4200);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6 lg:bottom-6">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift">
            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", t.tone === "success" && "bg-success-soft text-success", t.tone === "error" && "bg-danger-soft text-danger", t.tone === "info" && "bg-info-soft text-info")}>
              <Icon name={t.tone === "success" ? "check" : t.tone === "error" ? "alert" : "info"} size={14} strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description ? <div className="mt-0.5 text-sm text-muted">{t.description}</div> : null}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} className="-mr-1 -mt-1 rounded-lg p-1 text-subtle hover:bg-surface-2 hover:text-fg">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return {
    success: (title: string, description?: string) => c.toast({ tone: "success", title, description }),
    error: (title: string, description?: string) => c.toast({ tone: "error", title, description }),
    info: (title: string, description?: string) => c.toast({ tone: "info", title, description }),
  };
}
