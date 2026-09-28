import { PageHero, Section } from "@/components/site/section";
import { getPublicSettings } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Privacy policy", description: "How we collect, use and protect your information.", path: "/privacy" });

export default async function PrivacyPage() {
  const { legal } = await getPublicSettings(["legal"]);
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy policy" />
      <Section>
        <div className="prose-lite mx-auto max-w-3xl whitespace-pre-line text-muted">{legal.privacy}</div>
      </Section>
    </>
  );
}
