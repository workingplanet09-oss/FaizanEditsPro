import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/server/services/public";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const statics = ["", "/services", "/work", "/case-studies", "/process", "/pricing", "/about", "/blog", "/faq", "/contact", "/book", "/help", "/start-project", "/terms", "/privacy"];
  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const e = await sitemapEntries();
    dynamicEntries = [
      ...e.services.map((s) => ({ url: `${base}/services/${s.slug}`, lastModified: s.updatedAt, priority: 0.8 })),
      ...e.posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, priority: 0.6 })),
      ...e.cases.map((c) => ({ url: `${base}/case-studies/${c.slug}`, lastModified: c.updatedAt, priority: 0.7 })),
    ];
  } catch {
    /* database unavailable — still serve the static routes */
  }
  return [...statics.map((p) => ({ url: `${base}${p}`, lastModified: new Date(), priority: p === "" ? 1 : 0.7 })), ...dynamicEntries];
}
