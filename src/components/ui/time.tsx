import { timeAgo } from "@/lib/format";

/**
 * Relative time ("5m ago"). The server renders it at one instant and the browser hydrates a moment later, so the text can
 * legitimately differ by a minute at a boundary. suppressHydrationWarning is React's supported opt-out for exactly this.
 */
export function Ago({ value, prefix = "", suffix = "", className }: { value: Date | string | number | null | undefined; prefix?: string; suffix?: string; className?: string }) {
  return (
    <span suppressHydrationWarning className={className}>
      {prefix}
      {timeAgo(value)}
      {suffix}
    </span>
  );
}
