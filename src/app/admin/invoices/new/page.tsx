import Link from "next/link";
import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { DocBuilder } from "@/components/admin/doc-builder";
import { builderData } from "../../_lib/builder-data";

export const metadata = { title: "New invoice", robots: { index: false, follow: false } };

export default async function NewInvoice({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/invoices/new");
  if (!can(actor, "invoices:write")) denyPage();
  const sp = await searchParams;
  const d = await builderData(actor);
  return (
    <>
      <div className="mb-2"><Link href="/admin/invoices" className="text-sm font-semibold text-muted hover:text-fg">← Invoices</Link></div>
      <PageHeader title="New invoice" description="For extras, retainers and anything not covered by an accepted quote." />
      <DocBuilder mode="invoice" clients={d.clients} projects={d.projects} services={d.services} currencies={d.currencies} initial={{ clientId: first(sp.clientId), projectId: first(sp.projectId), currency: d.business.defaultCurrency, notes: d.invoice.notes }} defaults={{ taxRateBps: d.invoice.taxRateBps, depositPercent: 100, validDays: 14, terms: "", dueDays: d.invoice.dueDays }} />
    </>
  );
}
