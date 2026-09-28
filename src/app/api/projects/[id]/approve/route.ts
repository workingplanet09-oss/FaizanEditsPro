import { authRoute, z } from "@/server/api";
import { approveVersion } from "@/server/services/reviews";

/** POST /api/projects/:id/approve — pinned to a specific version; the caller must echo its number. */
export const POST = authRoute(
  { body: z.object({ versionId: z.string(), confirmVersionNumber: z.number().int().min(1), notes: z.string().max(1000).optional() }) },
  async ({ actor, params, body }) => approveVersion(actor, params.id, body),
);
