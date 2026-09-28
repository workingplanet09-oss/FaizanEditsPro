"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

interface N {
  id: string;
  category: "PROJECT" | "MESSAGE" | "PAYMENT" | "REVIEW" | "SYSTEM";
  title: string;
  message: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const CATS: { key: string; label: string; icon: string }[] = [
  { key: "", label: "All", icon: "bell" },
  { key: "PROJECT", label: "Projects", icon: "film" },
  { key: "MESSAGE", label: "Messages", icon: "message" },
  { key: "PAYMENT", label: "Payments", icon: "card" },
  { key: "REVIEW", label: "Reviews", icon: "eye" },
  { key: "SYSTEM", label: "System", icon: "settings" },
];
const CAT_ICON: Record<string, string> = { PROJECT: "film", MESSAGE: "message", PAYMENT: "card", REVIEW: "eye", SYSTEM: "settings" };

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [cat, setCat] = useState("");
  const [error, setError] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async (category = cat) => {
    try {
      const r = await api<{ items: N[]; unread: number }>(`/api/notifications?pageSize=12${category ? `&category=${category}` : ""}`);
      setItems(r.items);
      setUnread(r.unread);
      setError(false);
    } catch {
      setError(true);
    }
  }, [cat]);

  // light polling keeps the badge honest without websockets
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: N) {
    if (!n.readAt) {
      setItems((p) => p?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? p);
      setUnread((u) => Math.max(0, u - 1));
      void api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    await api("/api/notifications/read", { method: "POST", body: cat ? { category: cat } : {} }).catch(() => {});
    void load();
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-fg ring-2 ring-bg">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-lift max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold">Notifications</h2>
            <button type="button" onClick={markAll} disabled={!unread} className="text-xs font-semibold text-muted hover:text-fg disabled:opacity-40">
              Mark all as read
            </button>
          </div>
          <div className="scroll-x flex gap-1 border-b border-line px-3 py-2">
            {CATS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCat(c.key);
                  void load(c.key);
                }}
                className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition", cat === c.key ? "bg-fg text-bg" : "text-muted hover:bg-surface-2")}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="thin-scroll max-h-[min(26rem,60dvh)] overflow-y-auto">
            {error ? (
              <p className="p-6 text-center text-sm text-muted">Couldn't load notifications. We'll keep trying.</p>
            ) : items === null ? (
              <div className="space-y-3 p-4" role="status" aria-label="Loading notifications">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <Icon name="check-circle" size={26} className="mx-auto mb-2 text-subtle" />
                <p className="text-sm font-semibold">You're all caught up</p>
                <p className="mt-1 text-xs text-muted">New activity will show up here.</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cn("flex w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left transition hover:bg-surface-2/70", !n.readAt && "bg-accent-soft/60")}>
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                        <Icon name={CAT_ICON[n.category] ?? "bell"} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", !n.readAt ? "font-bold" : "font-medium")}>{n.title}</span>
                        {n.message ? <span className="mt-0.5 block truncate text-xs text-muted">{n.message}</span> : null}
                        <span className="mt-1 block text-[11px] text-subtle">{timeAgo(n.createdAt)}</span>
                      </span>
                      {!n.readAt ? <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
