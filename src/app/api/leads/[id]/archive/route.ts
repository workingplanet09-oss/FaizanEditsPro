import { authRoute, z } from "@/server/api";
import { archiveLead } from "@/server/services/leads";

export const POST = authRoute({ body: z.object({ archive: z.boolean().default(true) }).default({ archive: true }) }, async ({ actor, params, body }) => archiveLead(actor, params.id, body.archive));
