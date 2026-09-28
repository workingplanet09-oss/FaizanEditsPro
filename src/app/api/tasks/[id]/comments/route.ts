import { authRoute, z } from "@/server/api";
import { addTaskComment, listTaskComments } from "@/server/services/tasks";

export const GET = authRoute({}, async ({ actor, params }) => listTaskComments(actor, params.id));
export const POST = authRoute({ body: z.object({ body: z.string().trim().min(1).max(3000) }), status: 201 }, async ({ actor, params, body }) => addTaskComment(actor, params.id, body.body));
