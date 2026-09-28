import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { PageHero, Section } from "@/components/site/section";
import { WorkGrid, type WorkItem } from "@/components/site/work-grid";
import { listPortfolioCategories, listPublicPortfolio } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Our work — video editing portfolio", description: "Browse recent projects across real estate, podcasts, finance, SaaS, gaming, ads and more, with before/after comparisons and case studies.", path: "/work" });

export default async function WorkPage() {
  const [items, cats] = await Promise.all([listPublicPortfolio(), listPortfolioCategories()]);
  const data: WorkItem[] = items.map((w) => ({ id: w.id, slug: w.slug, title: w.title, clientName: w.clientName, industry: w.industry, category: w.category, projectType: w.projectType, platforms: w.platforms, thumbnailUrl: w.thumbnailUrl, videoUrl: w.videoUrl, beforeVideoUrl: w.beforeVideoUrl, afterVideoUrl: w.afterVideoUrl, description: w.description, caseStudySlug: w.caseStudy?.status === "PUBLISHED" ? w.caseStudy.slug : null, isDemo: w.isDemo }));
  return (
    <>
      <PageHero eyebrow="Work" title="A look at what we've made." description="Real projects, real deliverables. Open any project for the video and, where available, the full case study." />
      <Section>
        {data.length ? (
          <WorkGrid items={data} categories={cats.map((c) => c.category).sort()} />
        ) : (
          <EmptyState icon="film" title="Portfolio coming soon" description="We're curating our best projects. In the meantime, tell us about yours and we'll show you relevant examples on a call." action={<ButtonLink href="/start-project">Start a project</ButtonLink>} />
        )}
      </Section>
    </>
  );
}
