import { authRoute, z } from "@/server/api";
import { markContactHandled } from "@/server/services/leads";

export const POST = authRoute({ body: z.object({ handled: z.boolean().default(true) }).default({ handled: true }) }, async ({ actor, params, body }) => markContactHandled(actor, params.id, body.handled));
