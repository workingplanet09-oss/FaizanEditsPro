import { publicRoute, z } from "@/server/api";
import { requestMagicLink } from "@/server/services/auth";

export const POST = publicRoute({ body: z.object({ email: z.string().email().max(200), next: z.string().max(300).optional() }) }, async ({ body, ip }) => {
  await requestMagicLink({ email: body.email, ip, next: body.next });
  // identical response whether or not the account exists
  return { sent: true };
});
