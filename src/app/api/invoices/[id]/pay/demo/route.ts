import { authRoute } from "@/server/api";
import { demoPay } from "@/server/services/invoices";

export const POST = authRoute({}, async ({ actor, params }) => {
  const r = await demoPay(actor, params.id);
  return { status: r.invoice.status, paymentId: r.payment.id };
});
