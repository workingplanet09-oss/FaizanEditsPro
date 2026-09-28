import { authRoute, z } from "@/server/api";
import { listRevisions, submitRevision } from "@/server/services/reviews";

export const GET = authRoute({ query: z.object({ projectId: z.string().optional(), status: z.string().optional() }) }, async ({ actor, query }) => listRevisions(actor, query));
/** POST /api/revisions — the client sends their timestamped notes as a revision round. */
export const POST = authRoute({ body: z.object({ projectId: z.string(), versionId: z.string(), description: z.string().max(3000).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional() }), status: 201 }, async ({ actor, body }) => submitRevision(actor, body.projectId, body));
