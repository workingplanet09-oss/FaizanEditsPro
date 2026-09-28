import { authRoute } from "@/server/api";
import { startCheckout } from "@/server/services/invoices";

/** Creates a hosted checkout with the configured provider (Stripe) or a demo checkout. */
export const POST = authRoute({ rateLimit: { name: "checkout", limit: 20, windowSec: 600, by: "user" } }, async ({ actor, params }) => startCheckout(actor, params.id));
