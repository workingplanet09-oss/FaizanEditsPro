import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { PageHero, Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { Pagination } from "@/components/ui/table";
import { listBlogCategories, listPublicPosts } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({ title: "Blog & resources", description: "Editing tips, creator resources, video marketing insights and guides.", path: "/blog" });

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ category?: string; page?: string }> }) {
  const { category, page } = await searchParams;
  const [posts, cats] = await Promise.all([listPublicPosts({ category, page: Number(page) || 1 }), listBlogCategories()]);
  return (
    <>
      <PageHero eyebrow="Resources" title="Editing tips & creator resources." description="Practical ideas for better video — from hooks and pacing to workflows and marketing." />
      <Section>
        <div className="mb-8 flex flex-wrap gap-2">
          <Link href="/blog" className={cn("rounded-full border px-4 py-2 text-sm font-semibold", !category ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:text-fg")}>All</Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/blog?category=${c.slug}`} className={cn("rounded-full border px-4 py-2 text-sm font-semibold", category === c.slug ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:text-fg")}>{c.name}</Link>
          ))}
        </div>
        {posts.items.length ? (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.items.map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 60}>
                  <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                    <div className="relative aspect-[16/9] bg-surface-2">
                      {p.featuredImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.featuredImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_26%,var(--surface-2)),var(--surface-2))]"><Icon name="news" size={34} className="text-subtle" /></div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="eyebrow">{p.category?.name ?? "Article"}</div>
                      <h2 className="mt-2 text-lg font-extrabold leading-snug group-hover:text-accent">{p.title}</h2>
                      {p.excerpt ? <p className="mt-2 line-clamp-3 text-sm text-muted">{p.excerpt}</p> : null}
                      <div className="mt-auto pt-4 text-xs text-subtle">{formatDate(p.publishedAt)}{p.authorName ? ` · ${p.authorName}` : ""}</div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
            <div className="mt-8"><Pagination page={posts.page} pages={posts.pages} basePath="/blog" params={{ category }} /></div>
          </>
        ) : (
          <EmptyState icon="news" title="No articles yet" description="We're writing. Meanwhile, tell us about your project and we'll share tips tailored to it." action={<ButtonLink href="/start-project">Start a project</ButtonLink>} />
        )}
      </Section>
    </>
  );
}
