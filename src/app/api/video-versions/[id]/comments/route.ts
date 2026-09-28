import { authRoute, z } from "@/server/api";
import { addComment, listComments } from "@/server/services/reviews";

export const GET = authRoute({}, async ({ actor, params }) => listComments(actor, params.id));
/** POST /api/video-versions/:id/comments — timestamped feedback (milliseconds from start). */
export const POST = authRoute({ body: z.object({ timecodeMs: z.number().int().min(0).max(1000 * 60 * 60 * 24), comment: z.string().min(1).max(2000), parentId: z.string().nullish() }), status: 201 }, async ({ actor, params, body }) => addComment(actor, params.id, body));
