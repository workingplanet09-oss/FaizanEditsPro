import { publicRoute, z, setSessionCookies, AppError } from "@/server/api";
import { acceptInvite, resetPassword, verifyEmail, verifyMagicLink } from "@/server/services/auth";
import { rateLimit } from "@/server/security/ratelimit";

/** One endpoint for every emailed link: magic sign-in, email verification, invite acceptance, password reset. */
export const POST = publicRoute(
  { body: z.object({ type: z.enum(["magic", "verify", "invite", "reset"]), token: z.string().min(10).max(200), password: z.string().max(200).optional(), name: z.string().max(100).optional() }) },
  async ({ body, ip, req }) => {
    rateLimit(`token:${ip}`, 30, 15 * 60_000);
    const meta = { ip, ua: req.headers.get("user-agent") ?? undefined };
    if (body.type === "magic") {
      const r = await verifyMagicLink(body.token, meta);
      await setSessionCookies(r.session.token, r.session.expiresAt);
      return { redirect: r.requires2fa ? "/login/2fa" : r.redirect };
    }
    if (body.type === "verify") {
      const r = await verifyEmail(body.token, meta);
      await setSessionCookies(r.session.token, r.session.expiresAt);
      return { redirect: r.redirect };
    }
    if (body.type === "invite") {
      if (!body.password) throw new AppError("VALIDATION", "Choose a password.", { fields: { password: "Required." } });
      const r = await acceptInvite({ token: body.token, password: body.password, name: body.name }, meta);
      await setSessionCookies(r.session.token, r.session.expiresAt);
      return { redirect: r.redirect };
    }
    if (!body.password) throw new AppError("VALIDATION", "Choose a new password.", { fields: { password: "Required." } });
    await resetPassword({ token: body.token, password: body.password });
    return { redirect: "/login?reset=1" };
  },
);
