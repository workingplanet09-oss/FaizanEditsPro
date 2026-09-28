import { authRoute, z } from "@/server/api";
import { listPayments, recordManualPayment } from "@/server/services/invoices";

export const GET = authRoute({ query: z.object({ invoiceId: z.string().optional(), page: z.coerce.number().optional() }) }, async ({ actor, query }) => listPayments(actor, query));
/** POST /api/payments — staff records an offline payment against an invoice. */
export const POST = authRoute({ body: z.object({ invoiceId: z.string(), amount: z.number().int().min(1), method: z.string().trim().min(2).max(60), reference: z.string().max(120).optional() }), status: 201 }, async ({ actor, body }) => {
  const r = await recordManualPayment(actor, body.invoiceId, body);
  return { status: r.invoice.status, paymentId: r.payment.id };
});
