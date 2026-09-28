import { env } from "../env";
import { DemoPaymentProvider } from "./demo";
import { StripePaymentProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  return env.payments.provider === "stripe" ? new StripePaymentProvider() : new DemoPaymentProvider();
}
export type { PaymentProvider } from "./types";
