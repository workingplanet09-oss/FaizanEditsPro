import { authRoute, z } from "@/server/api";
import { listSessions, revokeSession } from "@/server/services/auth";

export const GET = authRoute({}, async ({ actor }) => listSessions(actor));
export const DELETE = authRoute({ body: z.object({ id: z.string() }) }, async ({ actor, body }) => revokeSession(actor, body.id));
