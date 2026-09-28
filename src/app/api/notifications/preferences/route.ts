import { authRoute, z } from "@/server/api";
import { getPreferences, setPreferences } from "@/server/services/notifications";

export const GET = authRoute({}, async ({ actor }) => getPreferences(actor));
export const PUT = authRoute({ body: z.object({ prefs: z.array(z.object({ category: z.string(), inApp: z.boolean(), email: z.boolean() })).max(10) }) }, async ({ actor, body }) => setPreferences(actor, body.prefs));
