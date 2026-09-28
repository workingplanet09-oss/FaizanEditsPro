import Link from "next/link";
import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { PageHeader } from "@/components/ui/primitives";
import { NewClientForm } from "@/components/admin/client-actions";

export const metadata = { title: "New client", robots: { index: false, follow: false } };

export default async function NewClientPage() {
  const actor = await requirePageActor("admin", "/admin/clients/new");
  if (!can(actor, "clients:write")) denyPage();
  return (
    <>
      <div className="mb-2"><Link href="/admin/clients" className="text-sm font-semibold text-muted hover:text-fg">← Clients</Link></div>
      <PageHeader title="New client" description="Add someone directly. To convert an inquiry, use the lead page instead — it carries over their answers." />
      <NewClientForm />
    </>
  );
}
