import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { listPublicCaseStudies } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { excerpt } from "@/lib/markdown";

export const metadata = pageMeta({ title: "Case studies", description: "How we solved real content problems: the brief, the strategy, and the results — with only verified numbers.", path: "/case-studies" });

export default async function CaseStudiesPage() {
  const cases = await listPublicCaseStudies();
  return (
    <>
      <PageHero eyebrow="Case studies" title="The problem, the edit, the result." description="Each story shows the brief, our approach and the outcomes the client actually saw." />
      <Section>
        {cases.length ? (
          <div className="grid gap-6 md:grid-cols-2">
            {cases.map((c, i) => (
              <Reveal key={c.id} delay={(i % 2) * 80}>
                <Link href={`/case-studies/${c.slug}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                  <div className="relative aspect-[16/8] overflow-hidden bg-surface-2">
                    {c.heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.heroImage} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_30%,var(--surface-2)),var(--surface-2))]">
                        <Icon name="book" size={40} className="text-subtle" />
                      </div>
                    )}
                    {c.isDemo ? <span className="absolute right-3 top-3 rounded-full bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase text-black">Demo</span> : null}
                  </div>
                  <div className="p-6">
                    <div className="eyebrow">{[c.clientName, c.industry].filter(Boolean).join(" · ")}</div>
                    <h2 className="mt-2 text-xl font-extrabold leading-snug">{c.title}</h2>
                    <p className="mt-2 text-sm text-muted">{excerpt(c.summary ?? c.problem, 160)}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold group-hover:text-accent">Read the case study <Icon name="arrow" size={14} /></span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState icon="book" title="Case studies are on the way" description="We only publish stories with results the client has verified. Ask us for relevant examples on a call." action={<ButtonLink href="/book">Book a call</ButtonLink>} />
        )}
      </Section>
    </>
  );
}
