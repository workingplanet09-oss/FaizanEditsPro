"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Logo } from "./logo";

export interface NavLink {
  label: string;
  href: string;
}

export function SiteHeader({ name, logoUrl, links, loginLabel, ctaLabel, signedIn, portalHref }: { name: string; logoUrl?: string; links: NavLink[]; loginLabel: string; ctaLabel: string; signedIn?: boolean; portalHref?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={cn("sticky top-0 z-40 border-b transition-colors duration-300", scrolled || open ? "border-line bg-bg/85 backdrop-blur-xl" : "border-transparent bg-bg/60 backdrop-blur-md")}>
      <div className="container-page flex h-16 items-center gap-3 sm:gap-6">
        <Logo name={name} logoUrl={logoUrl} />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("relative rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "text-fg" : "text-muted hover:text-fg")}>
                {l.label}
                {active ? <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle className="hidden sm:flex" />
          <ButtonLink href={signedIn ? portalHref ?? "/dashboard" : "/login"} variant="ghost" size="sm" className="hidden sm:inline-flex">
            {signedIn ? "My portal" : loginLabel}
          </ButtonLink>
          <ButtonLink href="/start-project" size="sm" className="whitespace-nowrap">
            <span className="sm:hidden">Start Project</span>
            <span className="hidden sm:inline">{ctaLabel}</span>
          </ButtonLink>
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-xl text-fg hover:bg-surface-2 lg:hidden">
            <Icon name={open ? "x" : "menu"} size={20} />
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-menu" className="animate-fade-in border-t border-line bg-bg lg:hidden">
          <nav aria-label="Mobile" className="container-page flex max-h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto py-4">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center justify-between rounded-xl px-3 py-3.5 text-lg font-bold hover:bg-surface-2">
                {l.label}
                <Icon name="arrow" size={16} className="text-subtle" />
              </Link>
            ))}
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-4">
              <ButtonLink href={signedIn ? portalHref ?? "/dashboard" : "/login"} variant="outline" className="flex-1">
                {signedIn ? "My portal" : loginLabel}
              </ButtonLink>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
