import { authRoute, z } from "@/server/api";
import { createVersion, listVersions } from "@/server/services/reviews";

export const GET = authRoute({}, async ({ actor, params }) => listVersions(actor, params.id));
export const POST = authRoute(
  { body: z.object({ assetId: z.string().optional(), videoUrl: z.string().url().max(500).optional(), notes: z.string().max(3000).optional(), changeSummary: z.string().max(2000).optional(), durationMs: z.number().int().min(0).optional(), revisionId: z.string().optional(), release: z.enum(["auto", "client", "internal", "draft"]).optional(), final: z.boolean().optional() }), status: 201 },
  async ({ actor, params, body }) => createVersion(actor, params.id, body),
);
