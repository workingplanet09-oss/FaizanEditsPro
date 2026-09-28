/** Money helpers. All stored amounts are integers in MINOR units (cents). Currency is always explicit. */

export const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "AED", "PKR", "CAD", "AUD"] as const;

const digitsCache = new Map<string, number>();
export function currencyDigits(currency: string): number {
  const c = currency.toUpperCase();
  let d = digitsCache.get(c);
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(c, d);
  }
  return d;
}

export function toMinor(major: number | string, currency: string): number {
  const n = typeof major === "string" ? Number(major.replace(/[^0-9.\-]/g, "")) : major;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** currencyDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

export function formatMoney(minor: number | null | undefined, currency = "USD", opts?: { compact?: boolean }): string {
  if (minor === null || minor === undefined) return "—";
  const digits = currencyDigits(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: opts?.compact && minor % 10 ** digits === 0 ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(minor / 10 ** digits);
  } catch {
    return `${currency} ${(minor / 10 ** digits).toFixed(digits)}`;
  }
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  deposit: number;
  balance: number;
}

/** Tax applies to (subtotal − discount). Deposit is a percentage of the total; balance is the remainder. */
export function computeTotals(
  lines: LineInput[],
  opts: { discount?: number; taxRateBps?: number; depositPercent?: number } = {},
): Totals {
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice), 0);
  const discount = Math.min(Math.max(opts.discount ?? 0, 0), subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * (opts.taxRateBps ?? 0)) / 10000);
  const total = taxable + tax;
  const pct = Math.min(Math.max(opts.depositPercent ?? 100, 0), 100);
  const deposit = pct >= 100 ? total : Math.round((total * pct) / 100);
  return { subtotal, discount, tax, total, deposit, balance: total - deposit };
}
