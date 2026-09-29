import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { listRetainers } from "@/server/services/retainers";
import { listClients } from "@/server/services/clients";
import { getSetting } from "@/server/services/settings";
import { db } from "@/server/db";
import { guard } from "@/server/page";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ProgressRow, RetainerBadge } from "@/components/portal/common";
import { NewRetainer, RetainerStatus } from "@/components/admin/retainer-admin";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Retainers", path: "/admin/retainers", noindex: true });

export default async function RetainersAdmin() {
  const actor = await requirePageActor("admin", "/admin/retainers");
  const list = await guard(() => listRetainers(actor));
  const manage = can(actor, "retainers:manage");
  const [clients, business, plans] = manage ? await Promise.all([listClients(actor, { pageSize: 200, sort: "name" }), getSetting(actor.workspaceId, "business"), db.pricingPlan.findMany({ where: { workspaceId: actor.workspaceId, billingType: "MONTHLY_RETAINER" }, orderBy: { sortOrder: "asc" } })]) : [null, null, []];
  const mrr: Record<string, number> = {};
  list.filter((r) => r.status === "ACTIVE").forEach((r) => (mrr[r.currency] = (mrr[r.currency] ?? 0) + r.monthlyPrice));
  return (
    <>
      <PageHeader title="Retainers" description={Object.keys(mrr).length ? `Monthly recurring: ${Object.entries(mrr).map(([c, v]) => formatMoney(v, c)).join(" · ")}` : "Monthly allowances for recurring clients."} actions={manage && clients && business ? <NewRetainer clients={clients.items.map((c) => ({ id: c.id, label: c.companyName }))} currencies={business.currencies} defaultCurrency={business.defaultCurrency} plans={plans.map((p) => ({ id: p.id, name: p.name, price: p.price, videos: p.includedVideos, shorts: p.includedShorts, hours: p.hoursIncluded, revisions: p.includedRevisions }))} /> : null} />
      {!list.length ? (
        <Card><EmptyState icon="repeat" title="No retainers yet" description="Create a retainer for clients who need a steady monthly flow of edits." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {list.map((r) => (
            <Card key={r.id}>
              <CardHeader title={<span className="flex flex-wrap items-center gap-2"><Link className="hover:underline" href={`/admin/clients/${r.client.id}`}>{r.client.companyName}</Link><RetainerBadge value={r.status} /></span>} description={`${r.name} · ${formatMoney(r.monthlyPrice, r.currency)}/mo · renews ${formatDate(r.renewalDate)}`} action={manage ? <RetainerStatus id={r.id} status={r.status} /> : null} />
              <div className="space-y-4 px-5 pb-5">
                {r.videosIncluded ? <ProgressRow label="Videos" used={r.usage.used.videos} total={r.videosIncluded} /> : null}
                {r.shortsIncluded ? <ProgressRow label="Short-form" used={r.usage.used.shorts} total={r.shortsIncluded} /> : null}
                {r.hoursIncluded ? <ProgressRow label="Hours" used={r.usage.used.hours} total={r.hoursIncluded} /> : null}
                {r.usage.upcoming.length ? <ul className="space-y-1 border-t border-line pt-3 text-sm">{r.usage.upcoming.slice(0, 4).map((p) => <li key={p.id}><Link className="hover:underline" href={`/admin/projects/${p.id}`}>{p.code} · {p.name}</Link></li>)}</ul> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
