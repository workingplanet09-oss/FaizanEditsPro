import { authRoute, z } from "@/server/api";
import { enableTwoFactor } from "@/server/services/auth";

export const POST = authRoute({ body: z.object({ code: z.string().min(6).max(12) }) }, async ({ actor, body }) => enableTwoFactor(actor, body.code));
