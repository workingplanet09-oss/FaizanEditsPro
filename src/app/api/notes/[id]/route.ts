import { authRoute, z } from "@/server/api";
import { deleteNote, pinNote } from "@/server/services/notes";

export const DELETE = authRoute({}, async ({ actor, params }) => deleteNote(actor, params.id));
export const PATCH = authRoute({ body: z.object({ pinned: z.boolean() }) }, async ({ actor, params, body }) => pinNote(actor, params.id, body.pinned));
