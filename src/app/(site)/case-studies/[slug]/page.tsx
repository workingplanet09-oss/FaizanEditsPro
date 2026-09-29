import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { BeforeAfter } from "@/components/site/before-after";
import { JsonLd } from "@/components/site/json-ld";
import { getPublicCaseStudy } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { excerpt, renderMarkdown } from "@/lib/markdown";
import { titleCase } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getPublicCaseStudy(slug);
  if (!c) return {};
  return pageMeta({ title: c.seoTitle || `${c.title} — case study`, description: c.seoDescription || excerpt(c.summary ?? c.problem), path: `/case-studies/${c.slug}`, image: c.heroImage, type: "article" });
}

const METRIC_LABELS: Record<string, string> = { views: "Views", watchTime: "Watch time", engagement: "Engagement", ctr: "CTR", leads: "Leads", conversions: "Conversions" };

/** Accepts the CMS shape ({ "Views": "12k" }) and, defensively, [{ label, value }] — anything else is ignored rather than crashing the page. */
function metricEntries(raw: unknown): [string, string][] {
  const out: [string, string][] = [];
  const add = (k: unknown, v: unknown) => {
    if (typeof k !== "string" || !k.trim()) return;
    if (typeof v === "string" || typeof v === "number") if (String(v).trim()) out.push([k, String(v)]);
  };
  if (Array.isArray(raw)) for (const r of raw) add((r as { label?: unknown })?.label, (r as { value?: unknown })?.value);
  else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) add(k, v);
  return out;
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getPublicCaseStudy(slug);
  if (!c) notFound();
  // Only metrics the admin actually entered are shown — nothing is inferred or filled in.
  const results = metricEntries(c.results);
  const sections: [string, string | null][] = [
    ["The problem", c.problem],
    ["The objective", c.objective],
    ["Editing strategy", c.strategy],
    ["Creative direction", c.creativeDirection],
  ];
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: c.title, description: excerpt(c.summary ?? c.problem), image: c.heroImage ?? undefined, datePublished: c.createdAt.toISOString(), dateModified: c.updatedAt.toISOString() }} />
      <PageHero eyebrow={`Case study · ${[c.clientName, c.industry].filter(Boolean).join(" · ")}`} title={c.title} description={c.summary ?? undefined} />
      <Section>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-12">
            {c.beforeVideoUrl && c.afterVideoUrl ? (
              <Reveal>
                <h2 className="mb-4 text-2xl font-extrabold">Before &amp; after</h2>
                <BeforeAfter before={c.beforeVideoUrl} after={c.afterVideoUrl} />
              </Reveal>
            ) : c.heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.heroImage} alt="" className="w-full rounded-[var(--radius-card)] border border-line" />
            ) : null}
            {sections.map(([title, body]) =>
              body ? (
                <Reveal key={title}>
                  <h2 className="text-2xl font-extrabold">{title}</h2>
                  <div className="prose-lite mt-3 text-muted" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
                </Reveal>
              ) : null,
            )}
            {c.clientFeedback ? (
              <Reveal>
                <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-8">
                  <Icon name="quote" size={28} className="text-accent-text" />
                  <blockquote className="mt-3 text-xl font-semibold leading-snug">“{c.clientFeedback}”</blockquote>
                  {c.feedbackAuthor ? <figcaption className="mt-4 text-sm text-muted">— {c.feedbackAuthor}</figcaption> : null}
                </figure>
              </Reveal>
            ) : null}
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {results.length ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <h2 className="font-extrabold">Results</h2>
                <dl className="mt-4 space-y-4">
                  {results.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                      <dt className="text-sm text-muted">{METRIC_LABELS[k] ?? titleCase(k)}</dt>
                      <dd className="font-display text-xl font-extrabold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[11px] text-subtle">Figures supplied by the client.</p>
              </div>
            ) : null}
            {c.deliverables.length ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <h2 className="font-extrabold">Deliverables</h2>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {c.deliverables.map((d) => (
                    <li key={d} className="flex gap-2.5"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent-text" /> {d}</li>
                  ))}
                </ul>
                {c.timeline ? <p className="mt-5 border-t border-line pt-4 text-sm text-muted"><span className="font-bold text-fg">Timeline · </span>{c.timeline}</p> : null}
              </div>
            ) : null}
            <ButtonLink href="/start-project" className="w-full" iconRight="arrow">Start a similar project</ButtonLink>
          </aside>
        </div>
      </Section>
    </>
  );
}
