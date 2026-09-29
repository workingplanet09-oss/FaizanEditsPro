import type { MetadataRoute } from "next";
import { env } from "@/server/env";

// Read APP_URL when the request arrives, not when the image is built: a Docker build has no idea what domain it will run on.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/admin", "/editor", "/login", "/register", "/auth/", "/s/"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
