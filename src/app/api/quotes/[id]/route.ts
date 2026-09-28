import { authRoute } from "@/server/api";
import { getQuote, updateQuote } from "@/server/services/quotes";
import { quoteBody } from "../route";

export const GET = authRoute({}, async ({ actor, params }) => getQuote(actor, params.id, { markViewed: true }));
export const PATCH = authRoute({ body: quoteBody.omit({ clientId: true, projectId: true, leadId: true }).partial() }, async ({ actor, params, body }) => updateQuote(actor, params.id, body as any));
