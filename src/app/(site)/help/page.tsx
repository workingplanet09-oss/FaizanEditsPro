import { PageHero, Section } from "@/components/site/section";
import { FaqList } from "@/components/site/faq-list";
import { ButtonLink } from "@/components/ui/button";
import { listKbArticles } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Help center", description: "How to upload footage, request revisions, understand turnaround, approve videos and pay invoices.", path: "/help" });

export default async function HelpPage() {
  const articles = await listKbArticles();
  const cats = [...new Set(articles.map((a) => a.category))];
  return (
    <>
      <PageHero eyebrow="Help center" title="How do I…?" description="Quick answers about uploading footage, revisions, turnaround, approval and payment." />
      <Section>
        <div className="mx-auto max-w-3xl space-y-12">
          {cats.map((c) => (
            <div key={c}>
              <h2 className="mb-4 text-xl font-extrabold">{c}</h2>
              <FaqList items={articles.filter((a) => a.category === c).map((a) => ({ id: a.id, question: a.title, answer: a.content }))} />
            </div>
          ))}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
            <h2 className="text-lg font-extrabold">Still stuck?</h2>
            <p className="mt-1 text-sm text-muted">Message your project manager inside your project, or contact the studio.</p>
            <ButtonLink href="/contact" variant="outline" className="mt-4">Contact support</ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
