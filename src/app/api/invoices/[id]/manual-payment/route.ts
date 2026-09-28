import { authRoute, z } from "@/server/api";
import { recordManualPayment } from "@/server/services/invoices";

export const POST = authRoute({ body: z.object({ amount: z.number().int().min(1), method: z.string().trim().min(2).max(60), reference: z.string().max(120).optional() }), status: 201 }, async ({ actor, params, body }) => {
  const r = await recordManualPayment(actor, params.id, body);
  return { status: r.invoice.status, paymentId: r.payment.id };
});
