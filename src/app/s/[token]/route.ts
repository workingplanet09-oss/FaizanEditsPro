import { NextRequest, NextResponse } from "next/server";
import { resolveShare } from "@/server/services/assets";
import { rateLimit } from "@/server/security/ratelimit";
import { clientIp } from "@/server/security/request";
import { env } from "@/server/env";

/** Public share links: /s/<token> → short-lived signed URL. Revocable per file. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    rateLimit(`share:${clientIp(req)}`, 60, 60_000);
    const { token } = await ctx.params;
    const r = await resolveShare(token);
    return NextResponse.redirect(new URL(r.url, env.appUrl), 302);
  } catch (e: any) {
    return new NextResponse(`<!doctype html><meta charset=utf-8><title>Link unavailable</title><body style="font:16px system-ui;padding:48px;max-width:520px;margin:auto"><h1>This link isn't available</h1><p>${String(e?.message ?? "It may have expired or been turned off.").replace(/[<>&]/g, "")}</p>`, { status: e?.status ?? 404, headers: { "content-type": "text/html" } });
  }
}
