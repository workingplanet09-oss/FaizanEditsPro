import { authRoute } from "@/server/api";
import { sendQuote } from "@/server/services/quotes";

export const POST = authRoute({}, async ({ actor, params }) => sendQuote(actor, params.id));
