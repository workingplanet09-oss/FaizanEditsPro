export interface CheckoutInput {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  description: string;
}

export interface CheckoutResult {
  /** redirect = send the browser to `url`; demo = confirm in-app */
  kind: "redirect" | "demo";
  url: string;
  reference?: string;
}

export interface WebhookEvent {
  type: "payment.succeeded" | "payment.failed";
  invoiceId: string;
  transactionId: string;
  amount: number;
  currency: string;
  method?: string;
}

/** Payment providers plug in here (Stripe today; PayPal, Paddle, Razorpay… by adding an adapter). */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
}
