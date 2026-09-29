import type { Metadata } from "next";
import { env } from "@/server/env";

/** Consistent per-page SEO: title, description, canonical URL, Open Graph + Twitter cards. */
/** The generated share card (app/opengraph-image.tsx). It redirects to the image set in Admin → Settings → SEO when there is one. */
const DEFAULT_SHARE_IMAGE = "/opengraph-image";

export function pageMeta(input: { title: string; description?: string; path: string; image?: string | null; type?: "website" | "article"; noindex?: boolean; publishedTime?: string }): Metadata {
  const url = `${env.appUrl}${input.path}`;
  // Private pages (portals, account) don't need a share card; every public page gets one.
  const image = input.image || (input.noindex ? undefined : DEFAULT_SHARE_IMAGE);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    robots: input.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title: input.title, description: input.description, url, type: input.type ?? "website", images: image ? [image] : undefined, publishedTime: input.publishedTime },
    twitter: { card: image ? "summary_large_image" : "summary", title: input.title, description: input.description, images: image ? [image] : undefined },
  };
}
