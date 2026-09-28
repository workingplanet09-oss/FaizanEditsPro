import { authRoute, z } from "@/server/api";
import { setCommentStatus } from "@/server/services/reviews";

export const PATCH = authRoute({ body: z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"]), response: z.string().max(2000).optional() }) }, async ({ actor, params, body }) => setCommentStatus(actor, params.id, body.status, body.response));
