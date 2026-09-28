import { authRoute, z } from "@/server/api";
import { createVersion } from "@/server/services/reviews";

/** POST /api/video-versions — upload a new edit (V1, V2…). Previous versions are never overwritten. */
export const POST = authRoute(
  { body: z.object({ projectId: z.string(), assetId: z.string().optional(), videoUrl: z.string().url().max(500).optional(), notes: z.string().max(3000).optional(), changeSummary: z.string().max(2000).optional(), durationMs: z.number().int().min(0).optional(), revisionId: z.string().optional(), release: z.enum(["auto", "client", "internal", "draft"]).optional(), final: z.boolean().optional() }), status: 201 },
  async ({ actor, body }) => {
    const { projectId, ...rest } = body;
    return createVersion(actor, projectId, rest);
  },
);
