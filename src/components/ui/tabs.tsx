import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabDef {
  key: string;
  label: string;
  count?: number | null;
  /** small dot to signal "something needs you" */
  alert?: boolean;
}

/** Link-based tabs: the active tab lives in the URL (?tab=), so pages stay server-rendered, shareable and back-button friendly. */
export function TabNav({ tabs, active, basePath, param = "tab", extra }: { tabs: TabDef[]; active: string; basePath: string; param?: string; extra?: Record<string, string | undefined> }) {
  const href = (k: string) => {
    const sp = new URLSearchParams();
    for (const [key, v] of Object.entries(extra ?? {})) if (v) sp.set(key, v);
    if (k !== tabs[0].key) sp.set(param, k);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Sections" className="thin-scroll -mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link href={href(t.key)} scroll={false} aria-current={on ? "page" : undefined} className={cn("relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-3 text-sm font-semibold transition-colors", on ? "text-fg" : "text-muted hover:text-fg")}>
                {t.label}
                {t.count ? <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold leading-none text-muted">{t.count}</span> : null}
                {t.alert ? <span aria-label="needs attention" className="h-2 w-2 rounded-full bg-accent" /> : null}
                {on ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
