import { authRoute, z } from "@/server/api";
import { addNote, listNotes } from "@/server/services/notes";

const entity = z.enum(["LEAD", "CLIENT", "PROJECT", "TASK", "INVOICE"]);
/** Internal notes — staff only. They live in their own table and are never exposed to the client portal. */
export const GET = authRoute({ query: z.object({ entityType: entity, entityId: z.string() }) }, async ({ actor, query }) => listNotes(actor, query.entityType, query.entityId));
export const POST = authRoute({ body: z.object({ entityType: entity, entityId: z.string(), body: z.string().max(5000), mentionUserIds: z.array(z.string()).max(10).optional(), pinned: z.boolean().optional() }), status: 201 }, async ({ actor, body }) => addNote(actor, body));
