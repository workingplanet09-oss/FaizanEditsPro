import { authRoute, z } from "@/server/api";
import { convertLead } from "@/server/services/leads";

export const POST = authRoute({ body: z.object({ createProject: z.boolean().optional(), invite: z.boolean().optional(), projectName: z.string().max(200).optional() }).default({}) }, async ({ actor, params, body }) => convertLead(actor, params.id, body));
