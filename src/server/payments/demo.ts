import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

/** Demo provider: no card is charged. The portal shows an explicit “Simulate payment” step. */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo";
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    return { kind: "demo", url: `/dashboard/invoices/${input.invoiceId}?checkout=demo`, reference: `demo_${input.invoiceId}` };
  }
  parseWebhook() {
    return null;
  }
}
