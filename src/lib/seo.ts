import type { Metadata } from "next";
import { env } from "@/server/env";

/** Consistent per-page SEO: title, description, canonical URL, Open Graph + Twitter cards. */
export function pageMeta(input: { title: string; description?: string; path: string; image?: string | null; type?: "website" | "article"; noindex?: boolean; publishedTime?: string }): Metadata {
  const url = `${env.appUrl}${input.path}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    robots: input.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title: input.title, description: input.description, url, type: input.type ?? "website", images: input.image ? [input.image] : undefined, publishedTime: input.publishedTime },
    twitter: { card: input.image ? "summary_large_image" : "summary", title: input.title, description: input.description, images: input.image ? [input.image] : undefined },
  };
}
