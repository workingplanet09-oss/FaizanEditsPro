import { publicRoute, z } from "@/server/api";
import { subscribeNewsletter } from "@/server/services/public";
import { assertNotSpam } from "@/server/security/spam";

export const POST = publicRoute({ body: z.object({ email: z.string().email().max(200), hp: z.string().optional() }), rateLimit: { name: "newsletter", limit: 6, windowSec: 3600 } }, async ({ body, ip }) => {
  await assertNotSpam({ hp: body.hp }, ip);
  return subscribeNewsletter(body.email);
});
