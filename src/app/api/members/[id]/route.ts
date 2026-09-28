import { authRoute, z } from "@/server/api";
import { removeMember, updateMember } from "@/server/services/clients";

export const PATCH = authRoute({ body: z.object({ role: z.enum(["OWNER", "MANAGER", "ASSISTANT", "BILLING", "MEMBER"]).optional(), title: z.string().max(80).optional() }) }, async ({ actor, params, body }) => updateMember(actor, params.id, body));
export const DELETE = authRoute({}, async ({ actor, params }) => removeMember(actor, params.id));
