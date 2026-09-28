"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

export function UserMenu({ name, email, links }: { name: string; email: string; links: { label: string; href: string; icon: string }[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-surface-2">
        <Avatar name={name} size={30} />
        <Icon name="chevron-down" size={14} className="hidden text-subtle sm:block" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 animate-pop overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
          <div className="py-1">
            {links.map((l) => (
              <Link key={l.href} role="menuitem" href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg">
                <Icon name={l.icon} size={16} />
                {l.label}
              </Link>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={logout} disabled={busy} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60">
            <Icon name="logout" size={16} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
