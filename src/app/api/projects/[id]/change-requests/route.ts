import { authRoute, z } from "@/server/api";
import { createChangeRequest, listChangeRequests } from "@/server/services/requests";

export const GET = authRoute({}, async ({ actor, params }) => listChangeRequests(actor, params.id));
export const POST = authRoute(
  { body: z.object({ whatChanged: z.string().trim().min(5, "Describe what changed.").max(3000), why: z.string().max(2000).optional(), additionalRequirements: z.string().max(3000).optional(), referenceAssetIds: z.array(z.string()).max(10).optional() }), status: 201 },
  async ({ actor, params, body }) => createChangeRequest(actor, params.id, body),
);
