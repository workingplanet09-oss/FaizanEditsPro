import { authRoute, z } from "@/server/api";
import { toggleAutomation } from "@/server/services/automations";

export const POST = authRoute({ body: z.object({ enabled: z.boolean() }) }, async ({ actor, params, body }) => toggleAutomation(actor, params.id, body.enabled));
