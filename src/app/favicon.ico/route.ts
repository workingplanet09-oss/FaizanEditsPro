import { env } from "@/server/env";

/** Browsers and crawlers ask for /favicon.ico by default (including on XML pages that have no <link rel="icon">). */
export function GET() {
  return Response.redirect(`${env.appUrl}/favicon.svg`, 308);
}
