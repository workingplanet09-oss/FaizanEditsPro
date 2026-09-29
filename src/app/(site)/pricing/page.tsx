import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section, SectionHeading } from "@/components/site/section";
import { PlanCard } from "@/components/site/cards";
import { FaqList } from "@/components/site/faq-list";
import { Reveal } from "@/components/site/reveal";
import { getSiteContext, listPublicFaqs, listPublicPlans } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Pricing", description: "Flexible video editing pricing: one-time projects, per-video or per-short rates, monthly retainers, hourly work and custom quotes.", path: "/pricing" });

const MODELS = [
  { icon: "film", title: "One-time project", body: "A single video or defined package with one fixed price.", fit: "Launches, campaigns, one-off content" },
  { icon: "video", title: "Per video", body: "A repeatable rate for each long-form video you send.", fit: "YouTube channels, podcasts" },
  { icon: "smartphone", title: "Per short", body: "Simple pricing per vertical clip, with volume-friendly batches.", fit: "Reels, Shorts, TikTok" },
  { icon: "repeat", title: "Monthly retainer", body: "A monthly allowance with priority scheduling and usage tracking.", fit: "Consistent publishing schedules" },
  { icon: "clock", title: "Hourly", body: "Billed by the hour for flexible or exploratory work.", fit: "Fixes, re-edits, consulting" },
  { icon: "clipboard", title: "Custom quote", body: "Tailored scope and price for complex or large projects.", fit: "VSLs, brand films, agencies" },
];

export default async function PricingPage() {
  const [plans, faqs, site] = await Promise.all([listPublicPlans(), listPublicFaqs({ category: "Pricing" }), getSiteContext()]);
  return (
    <>
      <PageHero eyebrow="Pricing" title="Pay for the outcome, not the guesswork." description="Every project starts with a clear, fixed-scope quote. Choose the model that fits how you publish.">
        <ButtonLink href="/start-project" size="lg" iconRight="arrow">Get a quote</ButtonLink>
      </PageHero>

      {plans.length ? (
        <Section>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => (
              <Reveal key={p.id}>
                <PlanCard p={p} />
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-subtle">Prices shown are starting points. Your quote states the exact scope, currency, deposit and turnaround.</p>
        </Section>
      ) : null}

      <Section tone={plans.length ? "alt" : "default"}>
        <SectionHeading eyebrow="Pricing models" title="Choose how you'd like to work." description="Not every client needs the same structure. We support all of these — mix them if it helps." />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODELS.map((m, i) => (
            <Reveal key={m.title} delay={(i % 3) * 60} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft"><Icon name={m.icon} size={20} /></span>
              <h3 className="mt-4 text-lg font-extrabold">{m.title}</h3>
              <p className="mt-2 text-sm text-muted">{m.body}</p>
              <p className="mt-4 border-t border-line pt-3 text-xs text-subtle"><span className="font-bold text-muted">Best for · </span>{m.fit}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            ["shield", "No surprises", "Your quote lists deliverables, quantity, revisions, turnaround and total before you commit."],
            ["layers", "Revisions built in", site.business.revisionPolicy],
            ["globe", "Your currency", "Quotes and invoices can be issued in USD, EUR, GBP, AED, PKR, CAD, AUD and more."],
          ].map(([icon, t, b]) => (
            <div key={t} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <Icon name={icon} size={22} className="text-accent" />
              <h3 className="mt-3 font-extrabold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      {faqs.length ? (
        <Section tone="alt">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <SectionHeading eyebrow="Pricing FAQ" title="Before you ask." className="mb-0" />
            <FaqList items={faqs} />
          </div>
        </Section>
      ) : null}
    </>
  );
}
