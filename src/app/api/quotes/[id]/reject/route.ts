import { authRoute, z } from "@/server/api";
import { rejectQuote } from "@/server/services/quotes";

export const POST = authRoute({ body: z.object({ reason: z.string().max(500).optional() }).default({}) }, async ({ actor, params, body }) => rejectQuote(actor, params.id, body.reason));
