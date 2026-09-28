"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/primitives";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  href: string;
  group: "Create" | "Go to";
}

interface Hit {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const KIND_ICON: Record<string, string> = { client: "building", lead: "inbox", project: "film", invoice: "receipt", quote: "clipboard", contract: "sign", file: "file", message: "message" };

/** ⌘K / Ctrl+K command menu: quick actions plus live permission-scoped search across clients, leads, projects, invoices, quotes, contracts, files and messages. */
export function CommandPalette({ commands, canSearch = true }: { commands: Command[]; canSearch?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      setHits([]);
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!canSearch || q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api<{ hits: Hit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        setHits(r.hits);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, canSearch]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => c.label.toLowerCase().includes(t)) : commands;
  }, [q, commands]);

  const rows: { key: string; label: string; sub?: string; icon: string; href: string; group: string }[] = useMemo(
    () => [
      ...filtered.map((c) => ({ key: c.id, label: c.label, sub: c.hint, icon: c.icon, href: c.href, group: c.group })),
      ...hits.map((h) => ({ key: `${h.kind}-${h.id}`, label: h.title, sub: h.subtitle, icon: KIND_ICON[h.kind] ?? "search", href: h.href, group: h.kind[0].toUpperCase() + h.kind.slice(1) + "s" })),
    ],
    [filtered, hits],
  );

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  useEffect(() => setIdx(0), [q, hits.length]);

  return (
    <dialog
      ref={dialog}
      aria-label="Command menu"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      className="m-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-lift open:animate-pop"
    >
      {open ? (
        <div>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Icon name="search" size={18} className="text-subtle" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setIdx((i) => Math.min(rows.length - 1, i + 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setIdx((i) => Math.max(0, i - 1)));
                if (e.key === "Enter" && rows[idx]) (e.preventDefault(), go(rows[idx].href));
              }}
              role="combobox"
              aria-expanded
              aria-controls="cmd-list"
              aria-activedescendant={rows[idx] ? `cmd-${rows[idx].key}` : undefined}
              placeholder="Search clients, projects, invoices… or type a command"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
            />
            {loading ? <Icon name="loader" size={16} className="animate-spin text-subtle" /> : <Kbd>esc</Kbd>}
          </div>
          <ul id="cmd-list" role="listbox" className="thin-scroll max-h-[min(24rem,55dvh)] overflow-y-auto p-2">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">{q.trim().length < 2 ? "Type at least 2 characters to search." : loading ? "Searching…" : `No results for “${q}”.`}</li>
            ) : (
              rows.map((r, i) => (
                <li key={r.key} id={`cmd-${r.key}`} role="option" aria-selected={i === idx}>
                  {i === 0 || rows[i - 1].group !== r.group ? <div className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{r.group}</div> : null}
                  <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => go(r.href)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === idx ? "bg-accent-soft" : "hover:bg-surface-2")}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                      <Icon name={r.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.label}</span>
                      {r.sub ? <span className="block truncate text-xs text-muted">{r.sub}</span> : null}
                    </span>
                    {i === idx ? <Kbd>↵</Kbd> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}

export function CommandTrigger({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("open-command-palette"))} className={cn("flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm text-subtle transition hover:border-subtle", className)} aria-label="Open command menu">
      <Icon name="search" size={15} />
      <span className="hidden sm:inline">Search or jump to…</span>
      <span className="ml-auto hidden gap-1 sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
