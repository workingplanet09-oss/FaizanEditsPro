import { ButtonLink } from "@/components/ui/button";
import { PageHero, Section } from "@/components/site/section";
import { ServiceCard } from "@/components/site/cards";
import { Reveal } from "@/components/site/reveal";
import { listPublicServices } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Video editing services", description: "Short-form, YouTube, podcast, real estate, corporate, SaaS, VSL, UGC, motion graphics and more — each with a fixed-scope quote and a transparent process.", path: "/services" });

export default async function ServicesPage() {
  const services = await listPublicServices();
  return (
    <>
      <PageHero eyebrow="Services" title="Editing for every kind of content." description="Each service comes with defined deliverables, a clear turnaround and a brief that adapts to your niche.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/start-project" iconRight="arrow">Start a project</ButtonLink>
          <ButtonLink href="/book" variant="outline" className="border-white/20 text-white hover:bg-white/10">Talk to us first</ButtonLink>
        </div>
      </PageHero>
      <Section>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <Reveal key={s.id} delay={(i % 3) * 60}>
              <ServiceCard s={s} />
            </Reveal>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-extrabold">Not sure which service fits?</h2>
            <p className="mt-1 text-sm text-muted">Describe what you're making and we'll recommend the right setup — no commitment.</p>
          </div>
          <ButtonLink href="/start-project" iconRight="arrow">Describe your project</ButtonLink>
        </div>
      </Section>
    </>
  );
}
