import Link from "next/link";
import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { DocBuilder } from "@/components/admin/doc-builder";
import { builderData } from "../../_lib/builder-data";

export const metadata = { title: "New quote", robots: { index: false, follow: false } };

export default async function NewQuote({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/quotes/new");
  if (!can(actor, "quotes:write")) denyPage();
  const sp = await searchParams;
  const d = await builderData(actor);
  return (
    <>
      <div className="mb-2"><Link href="/admin/quotes" className="text-sm font-semibold text-muted hover:text-fg">← Quotes</Link></div>
      <PageHeader title="New quote" description="Line items, deposit and terms. The client accepts it in their portal, which starts the contract." />
      <DocBuilder mode="quote" clients={d.clients} projects={d.projects} services={d.services} currencies={d.currencies} initial={{ clientId: first(sp.clientId), projectId: first(sp.projectId), leadId: first(sp.leadId), currency: d.business.defaultCurrency }} defaults={{ taxRateBps: d.quote.taxRateBps, depositPercent: d.quote.defaultDepositPercent, validDays: d.quote.validDays, terms: d.quote.terms, dueDays: d.invoice.dueDays }} />
    </>
  );
}
