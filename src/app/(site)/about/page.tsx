import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/primitives";
import { PageHero, Section, SectionHeading } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { getPublicSettings, getSiteContext } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "About the studio", description: "A video editing studio with its own production system — built for clarity, craft and honest scope.", path: "/about" });

export default async function AboutPage() {
  const [{ about }, site] = await Promise.all([getPublicSettings(["about"]), getSiteContext()]);
  return (
    <>
      <PageHero eyebrow={`About ${site.business.name}`} title={about.headline} />
      <Section>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal className="space-y-5 text-lg leading-relaxed text-muted">
            {about.story.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </Reveal>
          <Reveal delay={100} className="space-y-4">
            {about.values.map((v) => (
              <div key={v.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <h3 className="font-extrabold">{v.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{v.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </Section>
      {about.team.length ? (
        <Section tone="alt">
          <SectionHeading eyebrow="Team" title="The people behind the edits." />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {about.team.map((m) => (
              <div key={m.name} className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center">
                <Avatar name={m.name} src={m.imageUrl} size={72} className="mx-auto" />
                <h3 className="mt-4 font-extrabold">{m.name}</h3>
                <p className="text-sm text-accent-text">{m.role}</p>
                {m.bio ? <p className="mt-3 text-sm text-muted">{m.bio}</p> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      <Section>
        <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-extrabold">Let's make something worth watching.</h2>
            <p className="mt-1 text-muted">Tell us about your project — it takes about three minutes.</p>
          </div>
          <ButtonLink href="/start-project" size="lg" iconRight="arrow">Start a project</ButtonLink>
        </div>
      </Section>
    </>
  );
}
