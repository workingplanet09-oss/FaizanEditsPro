import { authRoute, z } from "@/server/api";
import { addMember, listMembers } from "@/server/services/clients";

export const GET = authRoute({}, async ({ actor, params }) => listMembers(actor, params.id));
export const POST = authRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), role: z.enum(["OWNER", "MANAGER", "ASSISTANT", "BILLING", "MEMBER"]), title: z.string().max(80).optional() }), status: 201 },
  async ({ actor, params, body }) => addMember(actor, { organizationId: params.id, ...body }),
);
