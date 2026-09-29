import type { NextRequest } from "next/server";
import { env } from "../env";

/**
 * The caller's IP, used for rate limiting and audit trails. Each reverse proxy appends the address it saw to X-Forwarded-For, so
 * the LEFT-most entry is whatever the client chose to send and can be forged to dodge limits. The trustworthy entry is the one added by
 * our own proxy: `hops` from the right (TRUSTED_PROXY_HOPS, default 1). With no proxy in front, the header can't be trusted at all.
 */
export function clientIp(req: Request | NextRequest): string {
  const h = req.headers;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const hops = env.trustedProxyHops;
  const fromProxy = hops > 0 && parts.length > 0 ? parts[Math.max(0, parts.length - hops)] : undefined;
  return (fromProxy || h.get("x-real-ip") || "0.0.0.0").slice(0, 64);
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
