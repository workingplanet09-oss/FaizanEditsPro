import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section, SectionHeading } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { FaqList } from "@/components/site/faq-list";
import { WorkGrid, type WorkItem } from "@/components/site/work-grid";
import { JsonLd } from "@/components/site/json-ld";
import { getPublicService, getSiteContext, listPublicFaqs, listPublicPortfolio } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { formatMoney } from "@/lib/money";
import { SERVICE_TO_LOOKING_FOR } from "@/lib/site-defaults";
import { env } from "@/server/env";

const CATEGORY_FOR: Record<string, string> = {
  "short-form-video-editing": "Short Form",
  "youtube-video-editing": "Long Form",
  "podcast-editing": "Podcast",
  "real-estate-video-editing": "Real Estate",
  "vsl-editing": "VSL",
  "saas-video-editing": "SaaS",
  "corporate-video-editing": "Corporate",
  "gaming-content-editing": "Gaming",
  "ugc-editing": "Ads",
  "ad-creative-editing": "Ads",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getPublicService(slug);
  if (!s) return {};
  return pageMeta({ title: s.seoTitle || `${s.title} — video editing service`, description: s.seoDescription || s.shortDescription, path: `/services/${s.slug}`, image: s.heroImage });
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getPublicService(slug);
  if (!s) notFound();
  const [site, faqsAll, faqsCat, work] = await Promise.all([getSiteContext(), listPublicFaqs({ serviceSlug: slug }), s.faqCategory ? listPublicFaqs({ category: s.faqCategory }) : Promise.resolve([]), CATEGORY_FOR[slug] ? listPublicPortfolio({ category: CATEGORY_FOR[slug], limit: 3 }) : Promise.resolve([])]);
  const faqs = [...faqsAll, ...faqsCat.filter((f) => !faqsAll.some((x) => x.id === f.id))].slice(0, 8);
  const addOns = asList(s.addOns);
  const workflow = asList(s.workflow);
  const looking = SERVICE_TO_LOOKING_FOR[slug];
  const startHref = `/start-project?service=${slug}${looking ? `&looking_for=${looking}` : ""}`;
  const workItems: WorkItem[] = work.map((w) => ({ id: w.id, slug: w.slug, title: w.title, clientName: w.clientName, industry: w.industry, category: w.category, projectType: w.projectType, platforms: w.platforms, thumbnailUrl: w.thumbnailUrl, videoUrl: w.videoUrl, beforeVideoUrl: w.beforeVideoUrl, afterVideoUrl: w.afterVideoUrl, description: w.description, caseStudySlug: w.caseStudy?.status === "PUBLISHED" ? w.caseStudy.slug : null, isDemo: w.isDemo }));

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Service", name: s.title, description: s.shortDescription, provider: { "@type": "ProfessionalService", name: site.business.name, url: env.appUrl }, areaServed: "Worldwide", serviceType: "Video editing" }} />
      <PageHero eyebrow={`Service · ${s.turnaround ?? "Custom timeline"}`} title={s.title} description={s.shortDescription}>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={startHref} size="lg" iconRight="arrow">Start a project</ButtonLink>
          <ButtonLink href="/book" size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10" icon="calendar">Book a call</ButtonLink>
        </div>
        <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm">
          <div>
            <dt className="text-muted">Starting at</dt>
            <dd className="mt-0.5 text-lg font-extrabold">{s.startingPrice ? formatMoney(s.startingPrice, s.currency, { compact: true }) : s.priceLabel || "Custom quote"}</dd>
          </div>
          <div>
            <dt className="text-muted">Turnaround</dt>
            <dd className="mt-0.5 text-lg font-extrabold">{s.turnaround ?? "Confirmed in your quote"}</dd>
          </div>
          <div>
            <dt className="text-muted">Revisions</dt>
            <dd className="mt-0.5 text-lg font-extrabold">Included in every quote</dd>
          </div>
        </dl>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">What you get</h2>
            {s.description ? <div className="prose-lite mt-5 text-muted" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.description) }} /> : null}
            <h3 className="mt-10 text-lg font-extrabold">Included in every project</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {s.included.map((i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Icon name="check-circle" size={18} className="mt-px shrink-0 text-accent" />
                  {i}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={100} className="space-y-6">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h3 className="font-extrabold">Who it's for</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                {s.whoFor.map((w) => (
                  <li key={w} className="flex gap-2.5">
                    <Icon name="users" size={16} className="mt-0.5 shrink-0 text-subtle" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            {s.platforms.length ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <h3 className="font-extrabold">Platforms</h3>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {s.platforms.map((p) => (
                    <li key={p} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold">{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {s.editingStyle ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <h3 className="font-extrabold">Editing style</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{s.editingStyle.replace(/\*\*/g, "")}</p>
              </div>
            ) : null}
          </Reveal>
        </div>
      </Section>

      {s.deliverables.length || s.exampleDeliverables.length ? (
        <Section tone="alt">
          <SectionHeading eyebrow="Deliverables" title="Exactly what lands in your portal." />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7">
              <h3 className="font-extrabold">Standard deliverables</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {s.deliverables.map((d) => (
                  <li key={d} className="flex gap-3">
                    <Icon name="film" size={16} className="mt-0.5 shrink-0 text-accent" /> {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7">
              <h3 className="font-extrabold">Example packages</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {s.exampleDeliverables.map((d) => (
                  <li key={d} className="flex gap-3">
                    <Icon name="package" size={16} className="mt-0.5 shrink-0 text-accent" /> {d}
                  </li>
                ))}
              </ul>
              {addOns.length ? (
                <>
                  <h3 className="mt-8 font-extrabold">Optional add-ons</h3>
                  <ul className="mt-4 space-y-2.5 text-sm text-muted">
                    {addOns.map((a) => (
                      <li key={a} className="flex gap-3">
                        <Icon name="plus" size={16} className="mt-0.5 shrink-0" /> {a}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      <Section>
        <SectionHeading eyebrow="Workflow" title="How a project runs." description={s.revisionPolicy ?? site.business.revisionPolicy} />
        <ol className="grid gap-4 md:grid-cols-5">
          {(workflow.length ? workflow : ["Tell us what you need", "Receive a quote", "Onboard & upload", "Review & revise", "Approve & download"]).map((w, i) => (
            <li key={w} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-extrabold">{i + 1}</span>
              <p className="mt-3 text-sm font-semibold leading-snug">{w}</p>
            </li>
          ))}
        </ol>
      </Section>

      {workItems.length ? (
        <Section tone="alt">
          <SectionHeading eyebrow="Examples" title="Recent work in this style." />
          <WorkGrid items={workItems} categories={[]} />
        </Section>
      ) : null}

      {faqs.length ? (
        <Section>
          <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <SectionHeading eyebrow="FAQ" title={`${s.title}: common questions`} className="mb-0" />
            <FaqList items={faqs} />
          </div>
        </Section>
      ) : null}

      <section className="dark-zone grain relative overflow-hidden">
        <div className="container-page flex flex-col items-start justify-between gap-6 py-16 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Let's talk about your {s.title.toLowerCase()} project.</h2>
            <p className="mt-2 text-muted">A short guided form — you'll get a fixed-scope quote.</p>
          </div>
          <div className="flex gap-3">
            <ButtonLink href={startHref} size="lg" iconRight="arrow">Start a project</ButtonLink>
            <Link href="/pricing" className="inline-flex h-13 items-center px-3 text-sm font-bold text-muted hover:text-fg">See pricing</Link>
          </div>
        </div>
      </section>
    </>
  );
}
