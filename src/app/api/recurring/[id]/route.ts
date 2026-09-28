import { authRoute, z } from "@/server/api";
import { setScheduleActive } from "@/server/services/recurring";

export const PATCH = authRoute({ body: z.object({ active: z.boolean() }) }, async ({ actor, params, body }) => setScheduleActive(actor, params.id, body.active));
