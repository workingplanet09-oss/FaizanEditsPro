import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { cached } from "../cache";
import { getSettings, getWorkspaceId } from "./settings";
import type { Settings } from "@/lib/site-defaults";

/**
 * Cached reads for the public website. Demo rows are only visible when DEMO_MODE=true, so a production
 * database can never show fictional content or metrics.
 */
const demoOnly = () => (env.demoMode ? {} : { isDemo: false });
const TTL = 20_000;

export interface SiteContext {
  workspaceId: string;
  business: Settings["business"];
  theme: Settings["theme"];
  nav: Settings["nav"];
  footer: Settings["footer"];
  seo: Settings["seo"];
  contactInfo: Settings["contactInfo"];
  workflow: Pick<Settings["workflow"], "referralsEnabled">;
  booking: { enabled: boolean };
  demoMode: boolean;
}

export const getSiteContext = () =>
  cached("public:site", TTL, async (): Promise<SiteContext> => {
    const workspaceId = await getWorkspaceId();
    const s = await getSettings(workspaceId, ["business", "theme", "nav", "footer", "seo", "contactInfo", "workflow", "booking"]);
    return { workspaceId, business: s.business, theme: s.theme, nav: s.nav, footer: s.footer, seo: s.seo, contactInfo: s.contactInfo, workflow: { referralsEnabled: s.workflow.referralsEnabled }, booking: { enabled: s.booking.enabled }, demoMode: env.demoMode };
  });

export interface ResolvedStat {
  key: string;
  label: string;
  value: string;
}

/** Real numbers from the database, or values the admin typed by hand. Anything without data is simply not shown. */
export const getPublicStats = () =>
  cached("public:stats", 60_000, async (): Promise<ResolvedStat[]> => {
    const ws = await getWorkspaceId();
    const { stats } = await getSettings(ws, ["stats"]);
    const demo = demoOnly();
    const out: ResolvedStat[] = [];
    for (const item of stats.items) {
      if (item.mode === "hidden") continue;
      if (item.mode === "manual") {
        if (item.value && item.value.trim()) out.push({ key: item.key, label: item.label, value: `${item.value.trim()}${item.suffix ?? ""}` });
        continue;
      }
      let value: string | null = null;
      if (item.key === "clients") {
        const n = await db.client.count({ where: { workspaceId: ws, ...demo, projects: { some: { status: "DELIVERED" } } } });
        value = n > 0 ? String(n) : null;
      } else if (item.key === "projects") {
        const n = await db.project.count({ where: { workspaceId: ws, ...demo, status: "DELIVERED" } });
        value = n > 0 ? String(n) : null;
      } else if (item.key === "turnaround") {
        const rows = await db.project.findMany({ where: { workspaceId: ws, ...demo, status: "DELIVERED", startDate: { not: null }, deliveredAt: { not: null } }, select: { startDate: true, deliveredAt: true }, take: 500 });
        if (rows.length) {
          const days = rows.reduce((s, r) => s + (r.deliveredAt!.getTime() - r.startDate!.getTime()) / 86400000, 0) / rows.length;
          value = `${Math.max(1, Math.round(days))} days`;
        }
      } else if (item.key === "satisfaction") {
        const a = await db.testimonial.aggregate({ where: { workspaceId: ws, ...demo, status: "APPROVED", permissionToPublish: true }, _avg: { rating: true }, _count: { _all: true } });
        value = a._count._all > 0 && a._avg.rating ? `${a._avg.rating.toFixed(1)}/5` : null;
      } else if (item.key === "content") {
        const n = await db.asset.count({ where: { workspaceId: ws, ...demo, isDeliverable: true, visibleToClient: true, status: "READY", deletedAt: null } });
        value = n > 0 ? String(n) : null;
      }
      if (value) out.push({ key: item.key, label: item.label, value });
    }
    return out;
  });

export const listPublicServices = (opts: { featured?: boolean } = {}) =>
  cached(`public:services:${opts.featured ? "f" : "all"}`, TTL, async () => {
    const ws = await getWorkspaceId();
    return db.service.findMany({ where: { workspaceId: ws, published: true, ...(opts.featured ? { featured: true } : {}) }, orderBy: { sortOrder: "asc" } });
  });

export const getPublicService = (slug: string) =>
  cached(`public:service:${slug}`, TTL, async () => {
    const ws = await getWorkspaceId();
    return db.service.findFirst({ where: { workspaceId: ws, slug, published: true } });
  });

export const listPublicPlans = () =>
  cached("public:plans", TTL, async () => {
    const ws = await getWorkspaceId();
    return db.pricingPlan.findMany({ where: { workspaceId: ws, enabled: true, ...demoOnly() }, orderBy: { sortOrder: "asc" } });
  });

export const listPublicPortfolio = (opts: { category?: string; featured?: boolean; limit?: number } = {}) =>
  cached(`public:portfolio:${opts.category ?? "all"}:${opts.featured ? "f" : ""}:${opts.limit ?? 0}`, TTL, async () => {
    const ws = await getWorkspaceId();
    const where: Prisma.PortfolioProjectWhereInput = { workspaceId: ws, status: "PUBLISHED", ...demoOnly(), ...(opts.category ? { category: opts.category } : {}), ...(opts.featured ? { featured: true } : {}) };
    return db.portfolioProject.findMany({ where, orderBy: [{ featured: "desc" }, { sortOrder: "asc" }], take: opts.limit, include: { caseStudy: { select: { slug: true, status: true } } } });
  });

export const listPortfolioCategories = () =>
  cached("public:portfolio-cats", TTL, async () => {
    const ws = await getWorkspaceId();
    const rows = await db.portfolioProject.groupBy({ by: ["category"], where: { workspaceId: ws, status: "PUBLISHED", ...demoOnly() }, _count: { _all: true } });
    return rows.map((r) => ({ category: r.category, count: r._count._all }));
  });

export const listPublicCaseStudies = () =>
  cached("public:cases", TTL, async () => {
    const ws = await getWorkspaceId();
    return db.caseStudy.findMany({ where: { workspaceId: ws, status: "PUBLISHED", ...demoOnly() }, orderBy: { createdAt: "desc" } });
  });

export const getPublicCaseStudy = (slug: string) =>
  cached(`public:case:${slug}`, TTL, async () => {
    const ws = await getWorkspaceId();
    return db.caseStudy.findFirst({ where: { workspaceId: ws, slug, status: "PUBLISHED", ...demoOnly() }, include: { portfolioProject: true } });
  });

export const listPublicTestimonials = (opts: { featured?: boolean; limit?: number } = {}) =>
  cached(`public:testimonials:${opts.featured ? "f" : "all"}:${opts.limit ?? 0}`, TTL, async () => {
    const ws = await getWorkspaceId();
    return db.testimonial.findMany({ where: { workspaceId: ws, status: "APPROVED", permissionToPublish: true, ...demoOnly(), ...(opts.featured ? { featured: true } : {}) }, orderBy: [{ featured: "desc" }, { createdAt: "desc" }], take: opts.limit });
  });

export const listPublicFaqs = (opts: { category?: string; serviceSlug?: string } = {}) =>
  cached(`public:faqs:${opts.category ?? ""}:${opts.serviceSlug ?? ""}`, TTL, async () => {
    const ws = await getWorkspaceId();
    const where: Prisma.FaqWhereInput = { workspaceId: ws, published: true, ...(opts.category ? { category: opts.category } : {}), ...(opts.serviceSlug ? { OR: [{ serviceSlugs: { has: opts.serviceSlug } }] } : {}) };
    return db.faq.findMany({ where, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  });

export const listPublicPosts = (opts: { category?: string; page?: number; pageSize?: number } = {}) =>
  cached(`public:posts:${opts.category ?? ""}:${opts.page ?? 1}:${opts.pageSize ?? 9}`, TTL, async () => {
    const ws = await getWorkspaceId();
    const pageSize = opts.pageSize ?? 9;
    const page = Math.max(1, opts.page ?? 1);
    const where: Prisma.BlogPostWhereInput = { workspaceId: ws, status: "PUBLISHED", publishedAt: { lte: new Date() }, ...demoOnly(), ...(opts.category ? { category: { slug: opts.category } } : {}) };
    const [items, total] = await Promise.all([db.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { category: true } }), db.blogPost.count({ where })]);
    return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
  });

export const getPublicPost = (slug: string) =>
  cached(`public:post:${slug}`, TTL, async () => {
    const ws = await getWorkspaceId();
    return db.blogPost.findFirst({ where: { workspaceId: ws, slug, status: "PUBLISHED", publishedAt: { lte: new Date() }, ...demoOnly() }, include: { category: true } });
  });

export const listBlogCategories = () =>
  cached("public:blogcats", TTL, async () => {
    const ws = await getWorkspaceId();
    return db.blogCategory.findMany({ where: { workspaceId: ws }, orderBy: { name: "asc" } });
  });

export const listKbArticles = () =>
  cached("public:kb", TTL, async () => {
    const ws = await getWorkspaceId();
    return db.kbArticle.findMany({ where: { workspaceId: ws, published: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  });

export const getPublicSettings = <K extends keyof Settings>(keys: K[]) => getWorkspaceId().then((ws) => getSettings(ws, keys));

export async function sitemapEntries() {
  const [services, posts, cases] = await Promise.all([listPublicServices(), listPublicPosts({ pageSize: 200 }), listPublicCaseStudies()]);
  return {
    services: services.map((s) => ({ slug: s.slug, updatedAt: s.updatedAt })),
    posts: posts.items.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    cases: cases.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt })),
  };
}

export async function subscribeNewsletter(email: string) {
  const ws = await getWorkspaceId();
  await db.newsletterSubscriber.upsert({ where: { workspaceId_email: { workspaceId: ws, email: email.toLowerCase() } }, create: { workspaceId: ws, email: email.toLowerCase() }, update: {} });
  return { ok: true };
}
