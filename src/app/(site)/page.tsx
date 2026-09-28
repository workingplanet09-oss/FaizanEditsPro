import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeroVisual } from "@/components/site/hero-visual";
import { Section, SectionHeading } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { PlanCard, ServiceCard, TestimonialCard } from "@/components/site/cards";
import { FaqList } from "@/components/site/faq-list";
import { WorkGrid, type WorkItem } from "@/components/site/work-grid";
import { JsonLd } from "@/components/site/json-ld";
import { getPublicSettings, getPublicStats, getSiteContext, listPublicFaqs, listPublicPlans, listPublicPortfolio, listPublicServices, listPublicTestimonials } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { env } from "@/server/env";

export async function generateMetadata() {
  const site = await getSiteContext();
  return pageMeta({ title: `${site.business.name} — Professional video editing for creators and brands`, description: site.seo.defaultDescription, path: "/", image: site.seo.ogImage || undefined });
}

const PORTAL_FEATURES = [
  { icon: "clipboard", title: "Guided briefs", body: "A short, adaptive setup instead of endless email threads — the questions change with your niche." },
  { icon: "message", title: "Timestamped review", body: "Click the timeline and leave feedback on the exact frame. Every note is tracked until it's resolved." },
  { icon: "layers", title: "Version history", body: "V1, V2, Final — nothing is overwritten. Compare versions side by side and approve the right one." },
  { icon: "shield", title: "Secure files & delivery", body: "Direct-to-cloud uploads, signed links, and final files that unlock when approval and payment are done." },
  { icon: "receipt", title: "Quotes, contracts, invoices", body: "Accept, e-sign and pay in your portal. Always know what you've agreed to and what's due." },
  { icon: "activity", title: "Always know what's next", body: "A live timeline shows what happened, what's happening, and what we need from you." },
];

export default async function HomePage() {
  const [site, stats, services, work, testimonials, plans, faqs, { process }] = await Promise.all([
    getSiteContext(),
    getPublicStats(),
    listPublicServices(),
    listPublicPortfolio({ featured: true, limit: 6 }),
    listPublicTestimonials({ limit: 3 }),
    listPublicPlans(),
    listPublicFaqs(),
    getPublicSettings(["process"]),
  ]);
  const hero = (await getPublicSettings(["hero"])).hero;
  const headline = hero.headline.split("\n");
  const workItems: WorkItem[] = work.map((w) => ({ id: w.id, slug: w.slug, title: w.title, clientName: w.clientName, industry: w.industry, category: w.category, projectType: w.projectType, platforms: w.platforms, thumbnailUrl: w.thumbnailUrl, videoUrl: w.videoUrl, beforeVideoUrl: w.beforeVideoUrl, afterVideoUrl: w.afterVideoUrl, description: w.description, caseStudySlug: w.caseStudy?.status === "PUBLISHED" ? w.caseStudy.slug : null, isDemo: w.isDemo }));

  return (
    <>
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "ProfessionalService", name: site.business.name, description: site.business.tagline, url: env.appUrl, email: site.business.email || undefined, telephone: site.business.phone || undefined, sameAs: Object.values(site.business.socials).filter(Boolean) }]} />

      {/* ───────── HERO ───────── */}
      <section className="dark-zone grain relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_0%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_70%),radial-gradient(50%_45%_at_0%_100%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(70%_60%_at_50%_30%,#000,transparent)]" />
        <div className="container-page grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-32">
          <div>
            <Reveal className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-2 pr-4 text-xs font-semibold text-muted backdrop-blur">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg">
                <Icon name="clapperboard" size={12} />
              </span>
              {hero.eyebrow}
            </Reveal>
            <Reveal delay={60}>
              <h1 className="display text-[clamp(2.5rem,5vw,4.7rem)]">
                {headline.map((line, i) => (
                  <span key={i} className={i === 1 ? "block text-accent" : "block"}>
                    {line}
                  </span>
                ))}
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{hero.subheadline}</p>
            </Reveal>
            <Reveal delay={220} className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href={hero.primaryCta.href} size="lg" iconRight="arrow">
                {hero.primaryCta.label}
              </ButtonLink>
              <ButtonLink href={hero.secondaryCta.href} size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                {hero.secondaryCta.label}
              </ButtonLink>
            </Reveal>
            <Reveal delay={300}>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {hero.trustPoints.map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Icon name="check-circle" size={16} className="text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <HeroVisual showreelUrl={hero.showreelUrl || undefined} posterUrl={hero.posterUrl || undefined} cards={hero.floatingCards} />
          </Reveal>
        </div>

        {/* trust strip: only real numbers (database or admin-entered). Falls back to honest capabilities. */}
        <div className="border-t border-white/10 bg-black/30 backdrop-blur">
          <div className="container-page py-8">
            {stats.length ? (
              <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
                {stats.map((s) => (
                  <div key={s.key}>
                    <dd className="font-display text-3xl font-extrabold tracking-tight tabular-nums">{s.value}</dd>
                    <dt className="mt-1 text-xs font-medium text-muted">{s.label}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <ul className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["clipboard", "Fixed-scope quotes"],
                  ["message", "Timestamped feedback"],
                  ["layers", "Every version kept"],
                  ["lock", "Private, signed file delivery"],
                ].map(([icon, label]) => (
                  <li key={label} className="flex items-center gap-3 font-semibold text-muted">
                    <Icon name={icon} size={18} className="text-accent" />
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ───────── SERVICES ───────── */}
      <Section id="services">
        <SectionHeading eyebrow="Services" title="Every kind of edit, one production system." description="From vertical shorts to long-form YouTube, podcasts to property tours — pick a service and we'll tailor the brief to it." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <Reveal key={s.id} delay={(i % 3) * 70}>
              <ServiceCard s={{ ...s, deliverables: s.deliverables }} compact />
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center">
          <ButtonLink href="/services" variant="outline" iconRight="arrow">
            Explore all services
          </ButtonLink>
        </div>
      </Section>

      {/* ───────── WORK ───────── */}
      {workItems.length ? (
        <Section tone="alt" id="work">
          <SectionHeading eyebrow="Selected work" title="Edits that hold attention." description="A few recent projects. Open any of them for the full story." />
          <WorkGrid items={workItems} categories={[]} />
          <div className="mt-10 text-center">
            <ButtonLink href="/work" variant="outline" iconRight="arrow">
              See all work
            </ButtonLink>
          </div>
        </Section>
      ) : null}

      {/* ───────── PROCESS ───────── */}
      <Section id="process" tone="dark">
        <SectionHeading eyebrow="How it works" title={process.heading} description={process.intro} />
        <ol className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {process.steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 50} className="group relative bg-surface p-6 transition hover:bg-surface-2">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong font-display text-sm font-extrabold transition group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">{i + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-extrabold leading-snug">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.summary}</p>
            </Reveal>
          ))}
          {process.steps.length % 4 === 3 ? (
            <li className="flex flex-col justify-between bg-accent p-6 text-accent-fg max-lg:hidden">
              <span className="text-base font-extrabold leading-snug">Ready when you are.</span>
              <Link href="/start-project" className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold underline-offset-4 hover:underline">
                Start a project <Icon name="arrow" size={15} />
              </Link>
            </li>
          ) : null}
        </ol>
        <div className="mt-8">
          <Link href="/process" className="inline-flex items-center gap-2 text-sm font-bold text-accent hover:underline">
            See the full process <Icon name="arrow" size={15} />
          </Link>
        </div>
      </Section>

      {/* ───────── PORTAL ───────── */}
      <Section id="portal">
        <SectionHeading eyebrow="Your client portal" title="A studio with its own production software." description="You'll never wonder where a project stands, where a file went, or who's handling what." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PORTAL_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 70} className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
                <Icon name={f.icon} size={20} />
              </span>
              <h3 className="text-base font-extrabold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ───────── TESTIMONIALS (approved + permitted only) ───────── */}
      {testimonials.length ? (
        <Section tone="alt">
          <SectionHeading eyebrow="Client feedback" title="What clients say after delivery." />
          <div className="grid gap-5 md:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ───────── PRICING ───────── */}
      <Section id="pricing">
        <SectionHeading eyebrow="Pricing" title="Flexible by design." description="One-time projects, per-video or per-short pricing, or a monthly retainer. Every project gets a clear, fixed-scope quote before anything starts." />
        {plans.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.slice(0, 4).map((p) => (
              <PlanCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["one-time", "One-time projects", "A single video or a defined package — quoted once, delivered once."],
              ["repeat", "Per-video & per-short", "Predictable pricing for creators who publish on a schedule."],
              ["calendar", "Monthly retainer", "A monthly allowance with priority scheduling and usage tracking."],
            ].map(([icon, t, b]) => (
              <div key={t} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <Icon name={icon === "one-time" ? "film" : icon === "repeat" ? "repeat" : "calendar"} size={22} className="text-accent" />
                <h3 className="mt-4 font-extrabold">{t}</h3>
                <p className="mt-2 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-10 text-center">
          <ButtonLink href="/pricing" variant="outline" iconRight="arrow">
            See pricing details
          </ButtonLink>
        </div>
      </Section>

      {/* ───────── FAQ ───────── */}
      <Section tone="alt">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="FAQ" title="Questions, answered." description="Can't find yours? Ask us anything — we reply within one business day." className="mb-0" />
          <div>
            <FaqList items={faqs.slice(0, 7)} />
            <Link href="/faq" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent hover:underline">
              Read all FAQs <Icon name="arrow" size={15} />
            </Link>
          </div>
        </div>
      </Section>

      {/* ───────── FINAL CTA ───────── */}
      <section className="dark-zone grain relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_120%,color-mix(in_srgb,var(--accent)_35%,transparent),transparent_70%)]" />
        <div className="container-page py-24 text-center sm:py-32">
          <Reveal>
            <h2 className="display mx-auto max-w-3xl text-[clamp(2.2rem,6vw,4.4rem)]">Ready to make your footage look unforgettable?</h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted">Tell us what you need in about three minutes. You'll get a clear plan and a fixed-scope quote — no obligation.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/start-project" size="lg" iconRight="arrow">
                Start a Project
              </ButtonLink>
              {site.booking.enabled ? (
                <ButtonLink href="/book" size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10" icon="calendar">
                  Book a call
                </ButtonLink>
              ) : null}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
