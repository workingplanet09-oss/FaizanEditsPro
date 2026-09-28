import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

interface Line { id?: string; description: string; quantity: number; unitPrice: number; amount: number }

/** Line items + totals for quotes and invoices (server-renderable, prints cleanly). */
export function DocLines({ items, currency, subtotal, discount, tax, taxRateBps, total, deposit, balance, amountPaid, depositPercent }: { items: Line[]; currency: string; subtotal: number; discount: number; tax: number; taxRateBps?: number; total: number; deposit?: number; balance?: number; amountPaid?: number; depositPercent?: number }) {
  const m = (n: number) => formatMoney(n, currency);
  return (
    <div>
      <table className="responsive-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs font-semibold text-subtle">
            <th className="py-2 pr-4 font-semibold">Description</th>
            <th className="w-20 py-2 pr-4 text-right font-semibold">Qty</th>
            <th className="w-32 py-2 pr-4 text-right font-semibold">Unit price</th>
            <th className="w-32 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((i, idx) => (
            <tr key={i.id ?? idx}>
              <td data-primary className="py-3 pr-4 font-medium">{i.description}</td>
              <td data-label="Qty" className="py-3 pr-4 text-right tabular-nums text-muted">{i.quantity}</td>
              <td data-label="Unit price" className="py-3 pr-4 text-right tabular-nums text-muted">{m(i.unitPrice)}</td>
              <td data-label="Amount" className="py-3 text-right font-semibold tabular-nums">{m(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
        <Row k="Subtotal" v={m(subtotal)} />
        {discount > 0 ? <Row k="Discount" v={`− ${m(discount)}`} /> : null}
        {tax > 0 ? <Row k={`Tax${taxRateBps ? ` (${(taxRateBps / 100).toFixed(taxRateBps % 100 ? 2 : 0)}%)` : ""}`} v={m(tax)} /> : null}
        <Row k="Total" v={m(total)} strong />
        {deposit !== undefined && balance !== undefined && balance > 0 ? (
          <>
            <Row k={`Deposit due now${depositPercent ? ` (${depositPercent}%)` : ""}`} v={m(deposit)} />
            <Row k="Balance on approval" v={m(balance)} muted />
          </>
        ) : null}
        {amountPaid ? <Row k="Paid" v={`− ${m(amountPaid)}`} /> : null}
        {amountPaid !== undefined && amountPaid > 0 ? <Row k="Amount due" v={m(Math.max(0, total - amountPaid))} strong /> : null}
      </dl>
    </div>
  );
}
function Row({ k, v, strong, muted }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "border-t border-line pt-2 text-base font-extrabold", muted && "text-muted")}>
      <dt className={cn(!strong && "text-muted")}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
