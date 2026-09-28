"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { NavGroup } from "./nav-config";

const isActive = (path: string, href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

/** Sidebar link list. Rendered inside the desktop rail and the mobile drawer. */
export function NavList({ groups, badges = {}, onNavigate }: { groups: NavGroup[]; badges?: Record<string, number>; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-6">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi}>
          {g.label ? <div className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = isActive(path, i.href, i.exact);
              const badge = badges[i.href];
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn("group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors", active ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}
                  >
                    <Icon name={i.icon} size={17} className={cn(active ? "text-accent" : "text-subtle group-hover:text-fg")} />
                    <span className="flex-1 truncate">{i.label}</span>
                    {badge ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">{badge > 99 ? "99+" : badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Hamburger + slide-over drawer for < lg screens. */
export function MobileNav({ groups, badges, title }: { groups: NavGroup[]; badges?: Record<string, number>; title: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <>
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2 lg:hidden">
        <Icon name="menu" size={20} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs animate-slide-in-left flex-col bg-bg shadow-lift">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <span className="text-base font-extrabold">{title}</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-2"><Icon name="x" size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><NavList groups={groups} badges={badges} onNavigate={() => setOpen(false)} /></div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Phone-only tab bar for the client portal (thumb reachable). */
export function BottomNav({ items, badges = {} }: { items: { label: string; href: string; icon: string; exact?: boolean }[]; badges?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((i) => {
          const active = isActive(path, i.href, i.exact);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", active ? "text-fg" : "text-subtle")}>
                <span className="relative">
                  <Icon name={i.icon} size={20} className={active ? "text-accent" : undefined} />
                  {badges[i.href] ? <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-extrabold text-accent-fg">{badges[i.href]}</span> : null}
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
