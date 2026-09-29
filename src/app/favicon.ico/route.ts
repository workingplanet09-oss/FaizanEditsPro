/** Browsers and crawlers ask for /favicon.ico by default (including on XML pages that have no <link rel="icon">). */
export const dynamic = "force-dynamic";

export function GET() {
  // A relative Location keeps this correct on whatever host serves it; nothing here depends on the build environment.
  return new Response(null, { status: 308, headers: { location: "/favicon.svg", "cache-control": "public, max-age=86400" } });
}
