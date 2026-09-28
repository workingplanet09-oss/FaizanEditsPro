import { authRoute, z } from "@/server/api";
import { changePassword } from "@/server/services/auth";

export const POST = authRoute({ body: z.object({ current: z.string().max(200), next: z.string().max(200) }), rateLimit: { name: "pw-change", limit: 8, windowSec: 900, by: "user" } }, async ({ actor, body }) => changePassword(actor, body));
