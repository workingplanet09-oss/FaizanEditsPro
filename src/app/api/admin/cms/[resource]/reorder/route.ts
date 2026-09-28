import { authRoute, z } from "@/server/api";
import { cmsReorder } from "@/server/services/cms";

export const POST = authRoute({ body: z.object({ ids: z.array(z.string()).min(1).max(500) }) }, async ({ actor, params, body }) => cmsReorder(actor, params.resource, body.ids));
