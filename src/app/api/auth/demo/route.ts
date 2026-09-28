import { publicRoute, z, setSessionCookies } from "@/server/api";
import { demoLogin } from "@/server/services/auth";

export const POST = publicRoute({ body: z.object({ kind: z.enum(["admin", "editor", "client"]) }), rateLimit: { name: "demo", limit: 30, windowSec: 600 } }, async ({ body, ip, req }) => {
  const r = await demoLogin(body.kind, { ip, ua: req.headers.get("user-agent") ?? undefined });
  await setSessionCookies(r.session.token, r.session.expiresAt);
  return { redirect: r.redirect };
});
