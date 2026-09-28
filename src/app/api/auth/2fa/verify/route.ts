import { publicRoute, z, readSessionToken, AppError } from "@/server/api";
import { completeTwoFactor } from "@/server/services/auth";

export const POST = publicRoute({ body: z.object({ code: z.string().min(6).max(24) }) }, async ({ body, ip }) => {
  const token = await readSessionToken();
  if (!token) throw new AppError("UNAUTHENTICATED", "Your sign-in expired. Please start again.");
  return completeTwoFactor(token, body.code, ip);
});
