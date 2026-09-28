import { authRoute, z } from "@/server/api";
import { updateTeamMember } from "@/server/services/team";

export const PATCH = authRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100).optional(), roleKeys: z.array(z.string()).min(1).max(4).optional(), suspended: z.boolean().optional(), hourlyCost: z.number().int().min(0).nullish() }) },
  async ({ actor, params, body }) => updateTeamMember(actor, params.id, body),
);
