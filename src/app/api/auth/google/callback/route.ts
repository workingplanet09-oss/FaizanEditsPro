import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { publicRoute, setSessionCookies } from "@/server/api";
import { handleGoogleCallback } from "@/server/services/auth";
import { safeEqual } from "@/server/auth/crypto";
import { env } from "@/server/env";

export const GET = publicRoute({ csrf: false }, async ({ req, ip }) => {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("fe_oauth_state")?.value ?? "";
  jar.delete("fe_oauth_state");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const fail = (why: string) => NextResponse.redirect(`${env.appUrl}/login?error=${why}`);
  if (!code || !expected || !safeEqual(state, expected)) return fail("google_failed");
  try {
    const r = await handleGoogleCallback(code, { ip, ua: req.headers.get("user-agent") ?? undefined });
    await setSessionCookies(r.session.token, r.session.expiresAt);
    return NextResponse.redirect(`${env.appUrl}${r.requires2fa ? "/login/2fa" : r.redirect}`);
  } catch {
    return fail("google_failed");
  }
});
