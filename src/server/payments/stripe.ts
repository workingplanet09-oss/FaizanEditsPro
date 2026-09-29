import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { AppError } from "../errors";
import { currencyDigits } from "@/lib/money";
import type { CheckoutInput, CheckoutResult, PaymentProvider, WebhookEvent } from "./types";

/** Minimal Stripe Checkout integration over fetch (no SDK dependency). Amounts are already minor units. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!env.payments.secretKey) throw new AppError("NOT_CONFIGURED", "Stripe is selected but PAYMENT_SECRET_KEY is not set.");
    // Stripe zero-decimal handling is done by currencyDigits: our minor units already match Stripe's for 2-decimal currencies.
    void currencyDigits;
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount),
      "line_items[0][price_data][product_data][name]": input.description,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      client_reference_id: input.invoiceId,
      "metadata[invoice_id]": input.invoiceId,
      "metadata[invoice_number]": input.invoiceNumber,
      "payment_intent_data[metadata][invoice_id]": input.invoiceId,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.payments.secretKey}`, "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new AppError("BAD_REQUEST", "The payment provider didn't respond. Please try again in a moment.");
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new AppError("BAD_REQUEST", `Payment provider error: ${json?.error?.message ?? res.status}`);
    return { kind: "redirect", url: json.url, reference: json.id };
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null {
    const secret = env.payments.webhookSecret;
    const sig = headers.get("stripe-signature");
    if (!secret || !sig) return null;
    // The header can carry several v1 signatures while a signing secret is being rotated; any one that verifies is enough.
    const pairs = sig.split(",").map((p) => [p.slice(0, p.indexOf("=")).trim(), p.slice(p.indexOf("=") + 1).trim()] as const);
    const t = pairs.find(([k]) => k === "t")?.[1];
    const candidates = pairs.filter(([k]) => k === "v1").map(([, v]) => v);
    if (!t || !candidates.length) return null;
    if (!Number.isFinite(Number(t)) || Math.abs(Date.now() / 1000 - Number(t)) > 600) return null; // replay window
    const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
    const valid = candidates.some((v1) => {
      const b = Buffer.from(v1);
      return b.length === expected.length && timingSafeEqual(expected, b);
    });
    if (!valid) return null;

    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      if (s.payment_status !== "paid") return null;
      return { type: "payment.succeeded", invoiceId: s.metadata?.invoice_id ?? s.client_reference_id, transactionId: s.payment_intent ?? s.id, amount: s.amount_total, currency: String(s.currency).toUpperCase(), method: "card" };
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const s = event.data.object;
      return { type: "payment.failed", invoiceId: s.metadata?.invoice_id ?? s.client_reference_id, transactionId: s.id, amount: s.amount_total ?? 0, currency: String(s.currency ?? "usd").toUpperCase() };
    }
    return null;
  }
}
