import { authRoute, z } from "@/server/api";
import { rejectLead } from "@/server/services/leads";

export const POST = authRoute({ body: z.object({ reason: z.string().max(300).optional() }).default({}) }, async ({ actor, params, body }) => rejectLead(actor, params.id, body.reason));
