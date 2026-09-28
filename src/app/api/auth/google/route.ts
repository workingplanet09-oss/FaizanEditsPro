import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { publicRoute } from "@/server/api";
import { googleAuthUrl, googleConfigured } from "@/server/services/auth";
import { randomToken } from "@/server/auth/crypto";

export const GET = publicRoute({}, async () => {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=google_not_configured", process.env.APP_URL ?? "http://localhost:3000"));
  const state = randomToken(16);
  (await cookies()).set("fe_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(googleAuthUrl(state));
});
