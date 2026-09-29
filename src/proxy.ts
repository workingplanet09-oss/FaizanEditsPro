import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/server/security/csp";

const PORTAL = /^\/(dashboard|admin|editor)(\/|$)/;

/**
 * Runs on every request (not on static assets), so it can use the RUNTIME environment:
 *  - the Content-Security-Policy, which depends on the storage origins configured for this deployment;
 *  - a convenience redirect for signed-out visitors to the portals. Real authentication + authorization still happens
 *    server-side in every layout, page and API route.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const portal = PORTAL.test(pathname);
  if (portal && !request.cookies.has("fe_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("content-security-policy", contentSecurityPolicy());
  if (portal) res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
