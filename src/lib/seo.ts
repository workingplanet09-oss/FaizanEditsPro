import type { Metadata } from "next";
import { env } from "@/server/env";

/** The generated share card (app/opengraph-image.tsx). It redirects to the image set in Admin → Settings → SEO when there is one. */
const DEFAULT_SHARE_IMAGE = "/opengraph-image";

/** Consistent per-page SEO: title, description, canonical URL, Open Graph + Twitter cards. */
export function pageMeta(input: { title: string; description?: string; path: string; image?: string | null; type?: "website" | "article"; noindex?: boolean; publishedTime?: string; /** the title already contains the brand, so don't append the site-wide "| Brand" template */ absoluteTitle?: boolean }): Metadata {
  const url = `${env.appUrl}${input.path}`;
  // Private pages (portals, account) don't need a share card; every public page gets one.
  const image = input.image || (input.noindex ? undefined : DEFAULT_SHARE_IMAGE);
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path },
    robots: input.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title: input.title, description: input.description, url, type: input.type ?? "website", images: image ? [image] : undefined, publishedTime: input.publishedTime },
    twitter: { card: image ? "summary_large_image" : "summary", title: input.title, description: input.description, images: image ? [image] : undefined },
  };
}
