import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { listRetainers } from "@/server/services/retainers";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ProgressRow, RetainerBadge, StatusBadge } from "@/components/portal/common";
import { RetainerStart } from "@/components/portal/retainer-start";
import { formatDate, formatDateShort } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { orgRoleCan } from "@/lib/permissions";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Retainers", path: "/dashboard/retainers", noindex: true });

export default async function RetainersPage() {
  const actor = await requirePageActor("client", "/dashboard/retainers");
  const list = await listRetainers(actor);
  const canManage = actor.orgs.some((o) => orgRoleCan(o.role, "manage_projects"));
  return (
    <>
      <PageHeader title="Retainers" description="A monthly allowance of edits with a dedicated turnaround. See what you've used and start new work in one click." />
      {!list.length ? (
        <Card>
          <EmptyState icon="repeat" title="No retainer yet" description="Retainers suit teams with regular content: a fixed number of videos or shorts every month at a lower per-video cost." action={<ButtonLink href="/pricing" variant="outline">See retainer plans</ButtonLink>} />
        </Card>
      ) : (
        <div className="space-y-6">
          {list.map((r) => (
            <Card key={r.id}>
              <CardHeader title={<span className="flex flex-wrap items-center gap-3">{r.name} <RetainerBadge value={r.status} /></span>} description={`${formatMoney(r.monthlyPrice, r.currency)} / month · renews ${formatDate(r.renewalDate)} · ${r.turnaroundDays}-day turnaround · ${r.revisionsIncluded} revisions per video`} action={r.status === "ACTIVE" && canManage ? <RetainerStart id={r.id} /> : null} />
              <div className="grid grid-cols-1 gap-6 px-5 pb-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">This month</h3>
                  {r.videosIncluded ? <ProgressRow label="Videos" used={r.usage.used.videos} total={r.videosIncluded} /> : null}
                  {r.shortsIncluded ? <ProgressRow label="Short-form" used={r.usage.used.shorts} total={r.shortsIncluded} /> : null}
                  {r.hoursIncluded ? <ProgressRow label="Hours" used={r.usage.used.hours} total={r.hoursIncluded} /> : null}
                </div>
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-subtle">In progress</h3>
                  {r.usage.upcoming.length ? (
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {r.usage.upcoming.map((p) => (
                        <li key={p.id}><Link href={`/dashboard/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/60"><span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="text-xs text-subtle">{p.deadline ? `Due ${formatDateShort(p.deadline)}` : p.code}</span></span><StatusBadge status={p.status as any} audience="client" /></Link></li>
                      ))}
                    </ul>
                  ) : <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">Nothing in progress. Start a project to use your allowance.</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
