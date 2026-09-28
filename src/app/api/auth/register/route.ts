import { publicRoute, z, setSessionCookies } from "@/server/api";
import { register } from "@/server/services/auth";
import { assertNotSpam } from "@/server/security/spam";

export const POST = publicRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(200), password: z.string().min(1).max(200), company: z.string().max(120).optional(), referralCode: z.string().max(24).optional(), hp: z.string().optional(), t: z.number().optional() }), status: 201 },
  async ({ body, ip, req }) => {
    await assertNotSpam({ hp: body.hp, t: body.t }, ip, { minMs: 1200 });
    const r = await register({ ...body, ip, ua: req.headers.get("user-agent") ?? undefined });
    await setSessionCookies(r.session.token, r.session.expiresAt);
    return { redirect: r.redirect, needsVerification: r.needsVerification };
  },
);
