import { authRoute } from "@/server/api";
import { sendInvoice } from "@/server/services/invoices";

export const POST = authRoute({}, async ({ actor, params }) => sendInvoice(actor, params.id));
