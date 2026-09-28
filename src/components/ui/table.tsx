import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** first column on mobile cards (rendered as the card title) */
  primary?: boolean;
  className?: string;
  hideOnMobile?: boolean;
  align?: "right";
}

/**
 * Responsive table: a regular dense table from md up; below that each row becomes a labelled card,
 * so nothing ever forces the page to scroll horizontally.
 */
export function DataTable<T>({ columns, rows, rowKey, rowHref, empty, className, dense = true }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; rowHref?: (r: T) => string | null; empty?: React.ReactNode; className?: string; dense?: boolean }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className={cn("overflow-hidden", className)}>
      <table className="responsive-table w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs font-semibold text-subtle">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-2.5 font-semibold whitespace-nowrap", c.align === "right" && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const href = rowHref?.(r);
            return (
              <tr key={rowKey(r)} className={cn("group transition-colors", href && "hover:bg-surface-2/60")}>
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    data-label={c.header}
                    data-primary={c.primary ? "" : undefined}
                    className={cn(dense ? "px-4 py-3" : "px-4 py-4", "align-middle", c.align === "right" && "text-right", c.hideOnMobile && "max-md:hidden", c.className)}
                  >
                    {i === 0 && href ? (
                      <Link href={href} className="block font-semibold after:absolute after:inset-0 md:after:hidden focus-visible:outline-offset-4">
                        {c.render(r)}
                      </Link>
                    ) : (
                      c.render(r)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pages, total, basePath, params }: { page: number; pages: number; total?: number; basePath: string; params?: Record<string, string | undefined> }) {
  if (pages <= 1) return total !== undefined ? <div className="px-4 py-3 text-xs text-subtle">{total} result{total === 1 ? "" : "s"}</div> : null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <span className="text-xs text-subtle">
        Page {page} of {pages}
        {total !== undefined ? ` · ${total} total` : ""}
      </span>
      <div className="flex gap-2">
        <Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : 0} href={href(Math.max(1, page - 1))} className={cn("inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 font-semibold hover:bg-surface-2", page <= 1 && "pointer-events-none opacity-40")}>
          <Icon name="chevron-left" size={14} /> Prev
        </Link>
        <Link aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : 0} href={href(Math.min(pages, page + 1))} className={cn("inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 font-semibold hover:bg-surface-2", page >= pages && "pointer-events-none opacity-40")}>
          Next <Icon name="chevron-right" size={14} />
        </Link>
      </div>
    </nav>
  );
}

/** URL-driven filter bar (plain GET form → server-rendered, shareable, no client JS needed). */
export function FilterBar({ action, fields, values, children }: { action: string; fields: { name: string; label: string; type?: "search" | "select"; options?: { value: string; label: string }[]; placeholder?: string }[]; values: Record<string, string | undefined>; children?: React.ReactNode }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2 border-b border-line p-3">
      {fields.map((f) =>
        f.type === "select" ? (
          <label key={f.name} className="text-xs font-semibold text-subtle">
            <span className="sr-only">{f.label}</span>
            <select name={f.name} defaultValue={values[f.name] ?? ""} aria-label={f.label} className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium text-fg focus:border-accent focus:outline-none">
              <option value="">{f.label}: all</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.name} className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <span className="sr-only">{f.label}</span>
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input type="search" name={f.name} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder ?? f.label} className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none" />
          </label>
        ),
      )}
      <button type="submit" className="h-9 rounded-lg bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
        Apply
      </button>
      {Object.values(values).some(Boolean) ? (
        <Link href={action} className="h-9 rounded-lg px-3 text-sm font-semibold leading-9 text-muted hover:text-fg">
          Clear
        </Link>
      ) : null}
      {children}
    </form>
  );
}
