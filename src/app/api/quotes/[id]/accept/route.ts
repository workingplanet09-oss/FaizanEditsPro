import { authRoute } from "@/server/api";
import { acceptQuote } from "@/server/services/quotes";

/** POST /api/quotes/:id/accept — the client accepts from the portal; acceptance (who/when/IP) is logged. */
export const POST = authRoute({}, async ({ actor, params }) => acceptQuote(actor, params.id));
