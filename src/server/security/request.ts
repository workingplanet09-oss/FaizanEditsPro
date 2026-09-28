import type { NextRequest } from "next/server";
import { env } from "../env";

export function clientIp(req: Request | NextRequest): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "0.0.0.0").slice(0, 64);
}

export function userAgent(req: Request | NextRequest): string {
  return (req.headers.get("user-agent") || "").slice(0, 300);
}

/** Origin/Sec-Fetch-Site check — the cheap, effective CSRF layer on top of SameSite cookies + double-submit token. */
export function isSameOrigin(req: Request | NextRequest): boolean {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  if (!origin) return true; // non-browser clients; still need the CSRF token when cookie-authenticated
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const app = new URL(env.appUrl);
    return o.host === host || o.host === app.host;
  } catch {
    return false;
  }
}
