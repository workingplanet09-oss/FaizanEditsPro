import { authRoute } from "@/server/api";
import { getInvoice } from "@/server/services/invoices";

export const GET = authRoute({}, async ({ actor, params }) => getInvoice(actor, params.id, { markViewed: true }));
