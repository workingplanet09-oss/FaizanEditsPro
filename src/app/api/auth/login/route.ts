import { publicRoute, z, setSessionCookies } from "@/server/api";
import { login } from "@/server/services/auth";

export const POST = publicRoute(
  { body: z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), status: 200 },
  async ({ body, ip, req }) => {
    const r = await login({ ...body, ip, ua: req.headers.get("user-agent") ?? undefined });
    await setSessionCookies(r.session.token, r.session.expiresAt);
    return r.requires2fa ? { requires2fa: true } : { requires2fa: false, redirect: r.redirect };
  },
);
