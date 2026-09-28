"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/money";

/** Starts checkout with whichever provider is configured. In demo mode no card is charged — the payment pipeline still runs for real. */
export function PayPanel({ id, due, currency, demoCheckout }: { id: string; due: number; currency: string; demoCheckout: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [demo, setDemo] = useState(demoCheckout);
  const start = useAction(async () => api<{ kind: "redirect" | "demo"; url: string }>(`/api/invoices/${id}/pay`, { body: {} }), {
    refresh: false,
    onSuccess: (r) => (r.kind === "redirect" ? (window.location.href = r.url) : setDemo(true)),
    onError: (e) => toast.error("Couldn't start payment", e.message),
  });
  const pay = useAction(async () => api(`/api/invoices/${id}/pay/demo`, { body: {} }), {
    onSuccess: () => {
      toast.success("Payment received", "Thank you! A receipt is on its way.");
      router.replace(`/dashboard/invoices/${id}?paid=1`);
    },
    onError: (e) => toast.error("Payment failed", e.message),
  });
  if (demo) {
    return (
      <div className="rounded-[var(--radius-card)] border-2 border-dashed border-accent/60 bg-accent-soft/40 p-5">
        <div className="flex items-start gap-3">
          <Icon name="card" size={20} className="mt-0.5" />
          <div className="flex-1">
            <h3 className="font-extrabold">Demo checkout</h3>
            <p className="mt-1 text-sm text-muted">Payments are in demo mode: no real card is charged, but the invoice, project activation, notifications and receipt all run exactly as they would live.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" icon="check-circle" loading={pay.pending} onClick={() => void pay.run()}>Simulate paying {formatMoney(due, currency)}</Button>
              <button type="button" onClick={() => setDemo(false)} className="text-sm font-semibold text-muted hover:text-fg">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <Button size="lg" icon="card" loading={start.pending} onClick={() => void start.run()}>Pay {formatMoney(due, currency)}</Button>;
}
