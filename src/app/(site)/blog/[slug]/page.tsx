import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { JsonLd } from "@/components/site/json-ld";
import { Section } from "@/components/site/section";
import { getPublicPost, getSiteContext } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { excerpt, renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { env } from "@/server/env";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPost(slug);
  if (!p) return {};
  return pageMeta({ title: p.seoTitle || p.title, description: p.metaDescription || p.excerpt || excerpt(p.content), path: `/blog/${p.slug}`, image: p.featuredImage, type: "article", publishedTime: p.publishedAt?.toISOString() });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, site] = await Promise.all([getPublicPost(slug), getSiteContext()]);
  if (!p) notFound();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.metaDescription || p.excerpt || excerpt(p.content), image: p.featuredImage ?? undefined, datePublished: p.publishedAt?.toISOString(), dateModified: p.updatedAt.toISOString(), author: { "@type": "Person", name: p.authorName ?? site.business.name }, publisher: { "@type": "Organization", name: site.business.name, url: env.appUrl } }} />
      <article>
        <header className="dark-zone grain relative overflow-hidden border-b border-line">
          <div className="container-page max-w-3xl py-20 sm:py-24">
            <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={15} /> All articles</Link>
            <div className="eyebrow mt-6">{p.category?.name ?? "Article"}</div>
            <h1 className="display mt-3 text-[clamp(2.1rem,5vw,3.6rem)]">{p.title}</h1>
            <p className="mt-5 text-sm text-muted">{formatDate(p.publishedAt)}{p.authorName ? ` · ${p.authorName}` : ""}</p>
          </div>
        </header>
        <Section>
          <div className="mx-auto max-w-3xl">
            {p.featuredImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.featuredImage} alt="" className="mb-10 w-full rounded-[var(--radius-card)] border border-line" />
            ) : null}
            <div className="prose-lite text-[17px] text-fg/90" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.content) }} />
            {p.tags.length ? <ul className="mt-10 flex flex-wrap gap-2">{p.tags.map((t) => <li key={t} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">#{t}</li>)}</ul> : null}
            <div className="mt-14 rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
              <h2 className="text-xl font-extrabold">Want this level of polish on your videos?</h2>
              <ButtonLink href="/start-project" className="mt-5" iconRight="arrow">Start a project</ButtonLink>
            </div>
          </div>
        </Section>
      </article>
    </>
  );
}
