import { formatMoney } from "@/lib/money";

/** A {USD: 12000, EUR: 500} map rendered as "$120.00 · €5.00" (never adds different currencies together). */
export function MoneyMap({ value, compact }: { value: Record<string, number>; compact?: boolean }) {
  const entries = Object.entries(value).filter(([, v]) => v);
  if (!entries.length) return <>{formatMoney(0, "USD", { compact })}</>;
  return <>{entries.map(([c, v], i) => <span key={c}>{i ? " · " : ""}{formatMoney(v, c, { compact })}</span>)}</>;
}
