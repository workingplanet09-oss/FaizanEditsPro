import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import type { Tone } from "@/lib/statuses";
import { initials } from "@/lib/format";

// ─────────── Card ───────────
export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-soft", hover && "transition duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:border-line-strong", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-base font-bold leading-tight">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ─────────── Badge (text + icon, never color alone) ───────────
const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-fg",
};
const toneIcon: Record<Tone, string> = { neutral: "clock", info: "info", warning: "alert", success: "check-circle", danger: "warning", accent: "sparkles" };

export function Badge({ tone = "neutral", children, className, icon, dot = true }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: string | false; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none", toneClass[tone], className)}>
      {icon === false ? null : icon ? <Icon name={icon} size={12} /> : dot ? <Icon name={toneIcon[tone]} size={12} /> : null}
      {children}
    </span>
  );
}

// ─────────── Avatar ───────────
export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-fg", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

// ─────────── Progress ───────────
export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${v}%` }} />
    </div>
  );
}

// ─────────── Skeleton ───────────
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────── Empty state ───────────
export function EmptyState({ icon = "inbox", title, description, action, className }: { icon?: string; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ─────────── Page header ───────────
export function PageHeader({ title, description, actions, eyebrow, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ─────────── Stat tile ───────────
export function Stat({ label, value, sub, tone, icon, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: string; href?: string }) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-1.5 truncate text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
        {sub ? <div className="mt-1 text-xs text-subtle">{sub}</div> : null}
      </div>
      {icon ? (
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone ? toneClass[tone] : "bg-surface-2 text-muted")}>
          <Icon name={icon} size={18} />
        </span>
      ) : null}
    </div>
  );
  const cls = "block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft transition hover:border-line-strong";
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

/** Two-line label/value used in detail panels. */
export function Meta({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || <span className="text-subtle">—</span>}</dd>
    </div>
  );
}
