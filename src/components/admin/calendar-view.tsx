import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { CalEvent } from "@/server/services/analytics";

const KIND: Record<string, { cls: string; icon: string; label: string }> = {
  deadline: { cls: "bg-danger-soft text-danger", icon: "clock", label: "Deadline" },
  call: { cls: "bg-info-soft text-info", icon: "phone", label: "Call" },
  meeting: { cls: "bg-info-soft text-info", icon: "users", label: "Meeting" },
  start: { cls: "bg-success-soft text-success", icon: "rocket", label: "Start" },
  draft: { cls: "bg-accent-soft text-fg", icon: "film", label: "Draft" },
  revision: { cls: "bg-warning-soft text-warning", icon: "refresh", label: "Revision" },
  retainer: { cls: "bg-accent-soft text-fg", icon: "repeat", label: "Retainer" },
  custom: { cls: "bg-surface-2 text-muted", icon: "calendar", label: "Event" },
  task: { cls: "bg-surface-2 text-fg", icon: "checklist", label: "Task" },
};
export const CAL_KINDS = KIND;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function EventChip({ e, compact }: { e: CalEvent; compact?: boolean }) {
  const k = KIND[e.kind] ?? KIND.custom;
  const inner = (
    <span className={cn("flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight", k.cls)} title={e.title}>
      <Icon name={k.icon} size={11} className="shrink-0" />
      <span className="truncate">{!e.allDay ? `${time(e.at)} ` : ""}{e.title}</span>
    </span>
  );
  return e.href ? <Link href={e.href} className="block hover:brightness-95">{inner}</Link> : <div>{inner}</div>;
  void compact;
}

export function CalendarView({ view, date, events, base }: { view: "month" | "week" | "day"; date: Date; events: CalEvent[]; base: string }) {
  const today = new Date();
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const k = ymd(new Date(e.at));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const shift = (v: "month" | "week" | "day", dir: number) => {
    const d = new Date(date);
    if (v === "month") d.setMonth(d.getMonth() + dir, 1);
    else d.setDate(d.getDate() + dir * (v === "week" ? 7 : 1));
    return `${base}?view=${v}&date=${ymd(d)}`;
  };
  const title = view === "month" ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : view === "week" ? `Week of ${startOfWeek(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={shift(view, -1)} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong hover:bg-surface-2"><Icon name="chevron-left" size={16} /></Link>
          <Link href={shift(view, 1)} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong hover:bg-surface-2"><Icon name="chevron-right" size={16} /></Link>
          <Link href={`${base}?view=${view}&date=${ymd(today)}`} className="h-9 rounded-lg border border-line-strong px-3 text-sm font-semibold leading-9 hover:bg-surface-2">Today</Link>
          <h2 className="ml-2 text-lg font-extrabold">{title}</h2>
        </div>
        <div className="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="group" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((v) => <Link key={v} href={`${base}?view=${v}&date=${ymd(date)}`} aria-current={view === v ? "page" : undefined} className={cn("rounded-lg px-3.5 py-1.5 capitalize", view === v ? "bg-surface shadow-soft" : "text-muted hover:text-fg")}>{v}</Link>)}
        </div>
      </div>

      {view === "month" ? <Month date={date} byDay={byDay} today={today} base={base} /> : null}
      {view === "week" ? <Week date={date} byDay={byDay} today={today} /> : null}
      {view === "day" ? <Day date={date} events={byDay.get(ymd(date)) ?? []} /> : null}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legend">
        {Object.entries(KIND).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", v.cls.split(" ")[0])} />{v.label}</li>)}
      </ul>
    </div>
  );
}

export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

function Month({ date, byDay, today, base }: { date: Date; byDay: Map<string, CalEvent[]>; today: Date; base: string }) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2/50 text-center text-[11px] font-bold uppercase tracking-wider text-subtle">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const list = byDay.get(ymd(d)) ?? [];
          const other = d.getMonth() !== date.getMonth();
          return (
            <div key={i} className={cn("min-h-24 border-b border-r border-line p-1.5 max-md:min-h-16", other && "bg-surface-2/40", (i + 1) % 7 === 0 && "border-r-0", i >= 35 && "border-b-0")}>
              <Link href={`${base}?view=day&date=${ymd(d)}`} className={cn("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold", sameDay(d, today) ? "bg-accent text-accent-fg" : other ? "text-subtle" : "hover:bg-surface-2")}>{d.getDate()}</Link>
              <div className="space-y-1 max-md:hidden">
                {list.slice(0, 3).map((e) => <EventChip key={e.id} e={e} />)}
                {list.length > 3 ? <Link href={`${base}?view=day&date=${ymd(d)}`} className="block px-1 text-[11px] font-semibold text-muted hover:text-fg">+{list.length - 3} more</Link> : null}
              </div>
              {list.length ? <div className="flex gap-0.5 md:hidden">{list.slice(0, 4).map((e) => <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", (KIND[e.kind] ?? KIND.custom).cls.split(" ")[0])} />)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Week({ date, byDay, today }: { date: Date; byDay: Map<string, CalEvent[]>; today: Date }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((d) => {
        const list = byDay.get(ymd(d)) ?? [];
        return (
          <section key={ymd(d)} className={cn("rounded-2xl border bg-surface p-3", sameDay(d, today) ? "border-accent" : "border-line")} aria-label={d.toDateString()}>
            <h3 className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wider text-subtle"><span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span><span className={cn("text-base font-extrabold normal-case tracking-normal", sameDay(d, today) ? "text-accent-text" : "text-fg")}>{d.getDate()}</span></h3>
            <div className="space-y-1.5">{list.length ? list.map((e) => <EventChip key={e.id} e={e} />) : <p className="py-3 text-center text-xs text-subtle">—</p>}</div>
          </section>
        );
      })}
    </div>
  );
}

function Day({ date, events }: { date: Date; events: CalEvent[] }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">
      {events.length ? (
        <ul className="divide-y divide-line">
          {events.map((e) => {
            const k = KIND[e.kind] ?? KIND.custom;
            const row = (
              <div className="flex items-center gap-4 py-3.5">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", k.cls)}><Icon name={k.icon} size={18} /></span>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold">{e.title}</div><div className="text-xs text-muted">{k.label} · {e.allDay ? "All day" : `${time(e.at)}${e.end ? ` – ${time(e.end)}` : ""}`}</div></div>
                {e.href ? <Icon name="chevron-right" size={16} className="text-subtle" /> : null}
              </div>
            );
            return <li key={e.id}>{e.href ? <Link href={e.href} className="block rounded-lg hover:bg-surface-2/50">{row}</Link> : row}</li>;
          })}
        </ul>
      ) : <p className="py-10 text-center text-sm text-muted">Nothing scheduled for {date.toLocaleDateString(undefined, { weekday: "long" })}.</p>}
    </div>
  );
}
