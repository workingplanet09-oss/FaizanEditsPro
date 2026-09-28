import { publicRoute, z } from "@/server/api";
import { requestPasswordReset } from "@/server/services/auth";

export const POST = publicRoute({ body: z.object({ email: z.string().email().max(200) }) }, async ({ body, ip }) => {
  await requestPasswordReset({ email: body.email, ip });
  return { sent: true };
});
