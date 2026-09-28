import { authRoute, z } from "@/server/api";
import { cancelInvoice } from "@/server/services/invoices";

export const POST = authRoute({ body: z.object({ reason: z.string().max(300).optional() }).default({}) }, async ({ actor, params, body }) => cancelInvoice(actor, params.id, body.reason));
