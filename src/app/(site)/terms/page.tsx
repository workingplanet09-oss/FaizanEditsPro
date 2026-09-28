import { PageHero, Section } from "@/components/site/section";
import { getPublicSettings } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Terms of service", description: "The terms that govern use of this website and the studio's services.", path: "/terms" });

export default async function TermsPage() {
  const { legal } = await getPublicSettings(["legal"]);
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of service" />
      <Section>
        <div className="prose-lite mx-auto max-w-3xl whitespace-pre-line text-muted">{legal.terms}</div>
      </Section>
    </>
  );
}
