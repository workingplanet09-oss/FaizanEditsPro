import { authRoute, z } from "@/server/api";
import { disableTwoFactor } from "@/server/services/auth";

export const POST = authRoute({ body: z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(12) }), rateLimit: { name: "2fa-disable", limit: 6, windowSec: 900, by: "user" } }, async ({ actor, body }) => disableTwoFactor(actor, body));
