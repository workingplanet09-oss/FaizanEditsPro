import Link from "next/link";
import { Badge, Avatar, Progress } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatDateShort, relativeDeadline, timeAgo, daysUntil } from "@/lib/format";
import {
  CLIENT_STEPS, CONTRACT_STATUS_META, INVOICE_STATUS_META, PRIORITY_META, QUOTE_STATUS_META, REVISION_STATUS_META, STATUS_META, TASK_STATUS_META, TEMPERATURE_META, LEAD_STATUS_META, CLIENT_STATUS_META, RETAINER_STATUS_META,
  clientStepIndex, type ProjectStatusKey, type Tone,
} from "@/lib/statuses";

// ─────────── badges ───────────
export function StatusBadge({ status, audience = "staff" }: { status: ProjectStatusKey; audience?: "staff" | "client" }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}>{audience === "client" ? m.clientLabel : m.label}</Badge>;
}

const table = (t: Record<string, { label: string; tone: Tone }>) =>
  function MetaBadge({ value, className }: { value: string; className?: string }) {
    const m = t[value] ?? { label: value.replace(/_/g, " ").toLowerCase(), tone: "neutral" as Tone };
    return <Badge tone={m.tone} className={className}>{m.label}</Badge>;
  };
export const QuoteBadge = table(QUOTE_STATUS_META);
export const InvoiceBadge = table(INVOICE_STATUS_META);
export const ContractBadge = table(CONTRACT_STATUS_META);
export const RevisionBadge = table(REVISION_STATUS_META);
export const TaskBadge = table(TASK_STATUS_META);
export const LeadStatusBadge = table(LEAD_STATUS_META);
export const ClientStatusBadge = table(CLIENT_STATUS_META);
export const RetainerBadge = table(RETAINER_STATUS_META);
export const PriorityBadge = table(Object.fromEntries(Object.entries(PRIORITY_META).map(([k, v]) => [k, { label: v.label, tone: v.tone }])));
export function TemperatureBadge({ value, overridden }: { value: string; overridden?: boolean }) {
  const m = TEMPERATURE_META[value] ?? TEMPERATURE_META.NEEDS_REVIEW;
  return <Badge tone={m.tone} icon={value === "HOT" ? "zap" : value === "WARM" ? "trending" : value === "COLD" ? "clock" : "help"}>{m.label}{overridden ? " ✎" : ""}</Badge>;
}

const PAYMENT: Record<string, { label: string; tone: Tone }> = {
  NONE: { label: "No invoice yet", tone: "neutral" },
  UNPAID: { label: "Unpaid", tone: "warning" },
  PARTIAL: { label: "Partially paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};
export function PaymentBadge({ state }: { state: string }) {
  const m = PAYMENT[state] ?? PAYMENT.NONE;
  return <Badge tone={m.tone} icon="card">{m.label}</Badge>;
}

// ─────────── stepper ───────────
/** The 7-step journey shown to clients. Current step is highlighted, earlier steps are checked. */
export function ClientStepper({ status, compact }: { status: ProjectStatusKey; compact?: boolean }) {
  const idx = status === "CANCELLED" ? -1 : clientStepIndex(status);
  const done = status === "DELIVERED" || status === "ARCHIVED";
  return (
    <ol className={cn("grid gap-1", compact ? "grid-cols-7" : "grid-cols-7 sm:gap-2")} aria-label="Project progress">
      {CLIENT_STEPS.map((s, i) => {
        const state = done || i < idx ? "done" : i === idx ? "current" : "todo";
        return (
          <li key={s.key} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", state === "todo" ? "bg-surface-2" : state === "current" ? "bg-accent" : "bg-fg")} />
            {!compact ? (
              <div className={cn("mt-2 truncate text-[11px] font-semibold", state === "current" ? "text-fg" : "text-subtle")}>
                <span className="sr-only">{state === "done" ? "Completed: " : state === "current" ? "Current: " : "Upcoming: "}</span>
                {s.label}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────── project card ───────────
export interface ProjectCardData {
  id: string;
  code: string;
  name: string;
  status: ProjectStatusKey;
  deadline: Date | string | null;
  service?: string | null;
  editor?: string | null;
  latestVersion?: { id: string; label: string; reviewStatus: string } | null;
}

export function ProjectCard({ p, base = "/dashboard" }: { p: ProjectCardData; base?: string }) {
  const meta = STATUS_META[p.status];
  const left = daysUntil(p.deadline);
  const late = left !== null && left < 0 && !["DELIVERED", "ARCHIVED", "CANCELLED", "APPROVED"].includes(p.status);
  const reviewable = p.latestVersion && ["CLIENT_REVIEW", "FINAL_REVIEW"].includes(p.status);
  return (
    <div className="group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{p.code}{p.service ? ` · ${p.service}` : ""}</div>
          <h3 className="mt-1 text-[17px] font-extrabold leading-snug tracking-tight">
            <Link href={`${base}/projects/${p.id}`} className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-offset-4">{p.name}</Link>
          </h3>
        </div>
        <StatusBadge status={p.status} audience="client" />
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{meta.clientNow}</p>
      <div className="mt-4"><ClientStepper status={p.status} compact /></div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          {p.editor ? (<><Avatar name={p.editor} size={20} /><span className="truncate">{p.editor}</span></>) : <span className="text-subtle">Editor being assigned</span>}
        </span>
        <span className={cn("shrink-0 font-semibold", late ? "text-danger" : "text-muted")} title={p.deadline ? formatDateShort(p.deadline) : undefined}>
          {p.deadline ? (["DELIVERED", "ARCHIVED"].includes(p.status) ? "Delivered" : relativeDeadline(p.deadline)) : "No deadline yet"}
        </span>
      </div>
      {reviewable ? (
        <Link href={`${base}/projects/${p.id}/review/${p.latestVersion!.id}`} className="relative z-10 mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-fg transition hover:brightness-105">
          <Icon name="play" size={15} /> Review {p.latestVersion!.label}
        </Link>
      ) : null}
    </div>
  );
}

// ─────────── activity feed ───────────
export function ActivityFeed({ items, showProject = true, empty = "Nothing has happened yet." }: { items: { id: string; message: string; at: Date | string; by?: string | null; project?: { id: string; name: string } | null; internal?: boolean }[]; showProject?: boolean; empty?: string }) {
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-subtle">{empty}</p>;
  return (
    <ol className="relative space-y-0 px-5 pb-2">
      <span aria-hidden className="absolute bottom-4 left-[29px] top-3 w-px bg-line" />
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3 py-2.5">
          <span aria-hidden className={cn("z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface", a.internal ? "bg-warning" : "bg-accent")} style={{ boxShadow: "0 0 0 3px var(--surface)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{a.message}{a.internal ? <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">Internal</span> : null}</p>
            <p className="mt-0.5 text-xs text-subtle">
              {timeAgo(a.at)}{a.by ? ` · ${a.by}` : ""}
              {showProject && a.project ? <> · <Link className="hover:text-fg hover:underline" href={`/dashboard/projects/${a.project.id}`}>{a.project.name}</Link></> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─────────── attention ───────────
const ATTN_ICON: Record<string, string> = { quote: "clipboard", contract: "sign", invoice: "receipt", setup: "rocket", files: "upload", review: "play", approve: "check-circle", download: "download" };
export function AttentionList({ items }: { items: { key: string; kind: string; title: string; detail: string; cta: string; href: string; tone: "warning" | "accent" | "success" }[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <li key={a.key}>
          <Link href={a.href} className={cn("group flex h-full items-start gap-3.5 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lift", a.tone === "warning" ? "border-warning/30 bg-warning-soft/60" : a.tone === "success" ? "border-success/30 bg-success-soft/60" : "border-accent/40 bg-accent-soft/60")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface shadow-soft"><Icon name={ATTN_ICON[a.kind] ?? "bell"} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold leading-snug">{a.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{a.detail}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold group-hover:underline">{a.cta} <Icon name="arrow" size={12} /></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ProgressRow({ label, used, total, unit = "" }: { label: string; used: number; total: number; unit?: string }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-muted">{used}{unit} of {total}{unit}</span></div>
      <Progress value={pct} label={`${label}: ${used} of ${total}`} />
    </div>
  );
}
