import { authRoute, z } from "@/server/api";
import { setRevisionStatus } from "@/server/services/reviews";

export const PATCH = authRoute({ body: z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"]) }) }, async ({ actor, params, body }) => setRevisionStatus(actor, params.id, body.status));
