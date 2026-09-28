import { authRoute, z } from "@/server/api";
import { updateMeeting } from "@/server/services/booking";

export const PATCH = authRoute({ body: z.object({ status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(), notes: z.string().max(1500).nullish(), startsAt: z.coerce.date().optional() }) }, async ({ actor, params, body }) => updateMeeting(actor, params.id, body as any));
