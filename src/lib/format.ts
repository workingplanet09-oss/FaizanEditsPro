export function formatBytes(bytes: number | bigint | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 74_500 ms → "01:14" (mm:ss) or "1:01:14" for long videos */
export function formatTimecode(ms: number, withMs = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const base = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return withMs ? `${base}.${String(Math.floor(ms % 1000)).padStart(3, "0")}` : base;
}

// Every date/time is formatted in UTC. The server and the browser can be in different time zones; formatting with
// the runtime's local zone made the same instant read "Oct 4" on one side and "Oct 5" on the other (a hydration mismatch).
// Times of day carry an explicit "UTC" so nobody has to guess. Use <LocalTime> where a visitor's own zone matters.
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateShortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

const toDate = (d: Date | string | number | null | undefined) => (d === null || d === undefined || d === "" ? null : new Date(d));

export function formatDate(d: Date | string | number | null | undefined): string {
  const x = toDate(d);
  return x && !isNaN(x.getTime()) ? dateFmt.format(x) : "—";
}
export function formatDateShort(d: Date | string | number | null | undefined): string {
  const x = toDate(d);
  return x && !isNaN(x.getTime()) ? dateShortFmt.format(x) : "—";
}
/** "Oct 5, 3:00 PM UTC" */
export function formatDateTime(d: Date | string | number | null | undefined): string {
  const x = toDate(d);
  return x && !isNaN(x.getTime()) ? `${dateTimeFmt.format(x)} UTC` : "—";
}

export function timeAgo(d: Date | string | number | null | undefined, now = Date.now()): string {
  const x = toDate(d);
  if (!x) return "—";
  const diff = Math.round((now - x.getTime()) / 1000);
  const abs = Math.abs(diff);
  const fmt = (n: number, u: string) => (diff >= 0 ? `${n}${u} ago` : `in ${n}${u}`);
  if (abs < 45) return diff >= 0 ? "just now" : "in a moment";
  if (abs < 3600) return fmt(Math.round(abs / 60), "m");
  if (abs < 86400) return fmt(Math.round(abs / 3600), "h");
  if (abs < 86400 * 30) return fmt(Math.round(abs / 86400), "d");
  return formatDate(x);
}

/** Whole days until a date (negative = overdue). */
export function daysUntil(d: Date | string | null | undefined, now = new Date()): number | null {
  const x = toDate(d);
  if (!x) return null;
  const a = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86400000);
}

export function relativeDeadline(d: Date | string | null | undefined): string {
  const n = daysUntil(d);
  if (n === null) return "No deadline";
  if (n < -1) return `${Math.abs(n)} days overdue`;
  if (n === -1) return "1 day overdue";
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Time-of-day greeting for a local hour (0–23). Without an hour (unknown time zone) it stays neutral rather than guessing. */
export function greeting(hour?: number): string {
  if (hour === undefined) return "Welcome back";
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
