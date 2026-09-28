import { authRoute, z } from "@/server/api";
import { inviteTeamMember, listRoles, listTeam } from "@/server/services/team";

export const GET = authRoute({}, async ({ actor }) => ({ members: await listTeam(actor), roles: await listRoles(actor) }));
export const POST = authRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), roleKeys: z.array(z.string()).min(1).max(4), hourlyCost: z.number().int().min(0).nullish() }), status: 201 },
  async ({ actor, body }) => inviteTeamMember(actor, body),
);
