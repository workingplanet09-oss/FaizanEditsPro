import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { getPublicSettings } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Our process — from brief to final delivery", description: "Seven clear steps: tell us what you need, get a quote, onboard, edit, review with timestamped feedback, and download your final files.", path: "/process" });

export default async function ProcessPage() {
  const { process } = await getPublicSettings(["process"]);
  return (
    <>
      <PageHero eyebrow="Process" title={process.heading} description={process.intro}>
        <ButtonLink href="/start-project" size="lg" iconRight="arrow">Start step one</ButtonLink>
      </PageHero>
      <Section>
        <ol className="relative mx-auto max-w-4xl space-y-6 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-line max-sm:before:hidden">
          {process.steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={40} className="relative grid gap-5 sm:grid-cols-[56px_1fr]">
              <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-bg font-display text-xl font-extrabold">{i + 1}</span>
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{s.title}</h2>
                <p className="mt-1 text-sm font-semibold text-accent">{s.summary}</p>
                <p className="mt-4 leading-relaxed text-muted">{s.detail}</p>
                <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Icon name="user" size={15} /></span>
                    <div><div className="text-xs font-bold uppercase tracking-wide text-subtle">You</div><p className="mt-0.5 text-sm">{s.youDo}</p></div>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><Icon name="clapperboard" size={15} /></span>
                    <div><div className="text-xs font-bold uppercase tracking-wide text-subtle">The studio</div><p className="mt-0.5 text-sm">{s.weDo}</p></div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>
    </>
  );
}
