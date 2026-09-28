import { publicRoute, clearSessionCookies, readSessionToken } from "@/server/api";
import { destroySessionByToken } from "@/server/auth/session";

export const POST = publicRoute({ csrf: false }, async () => {
  const t = await readSessionToken();
  if (t) await destroySessionByToken(t);
  await clearSessionCookies();
  return { redirect: "/login" };
});
