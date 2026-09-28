import { ButtonLink } from "@/components/ui/button";
import { PageHero, Section } from "@/components/site/section";
import { FaqList } from "@/components/site/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { listPublicFaqs } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";
import { FAQ_CATEGORIES } from "@/lib/cms-resources";
import { excerpt } from "@/lib/markdown";

export const metadata = pageMeta({ title: "Frequently asked questions", description: "Answers about pricing, turnaround, revisions, files, payments, editing, retainers and contracts.", path: "/faq" });

export default async function FaqPage() {
  const faqs = await listPublicFaqs();
  const cats = [...FAQ_CATEGORIES.filter((c) => faqs.some((f) => f.category === c)), ...new Set(faqs.map((f) => f.category).filter((c) => !FAQ_CATEGORIES.includes(c)))];
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.slice(0, 30).map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: excerpt(f.answer, 500) } })) }} />
      <PageHero eyebrow="FAQ" title="Everything you'd want to know first." description="Can't find your answer? Ask us — we reply within one business day.">
        <ButtonLink href="/contact" variant="outline" className="border-white/20 text-white hover:bg-white/10">Ask a question</ButtonLink>
      </PageHero>
      <Section>
        <div className="mx-auto max-w-3xl space-y-14">
          {cats.map((c) => (
            <div key={c} id={c.toLowerCase()}>
              <h2 className="mb-4 text-xl font-extrabold">{c}</h2>
              <FaqList items={faqs.filter((f) => f.category === c)} />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
