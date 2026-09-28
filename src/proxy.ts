import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-cheap guard: signed-out visitors never reach portal shells. This is only a convenience redirect —
 * real authentication + authorization happens server-side in every layout, page and API route.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!request.cookies.has("fe_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/editor/:path*"] };
