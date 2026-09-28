import Link from "next/link";
import { can, type Actor } from "@/server/auth/actor";
import { listRevisions } from "@/server/services/reviews";
import { guard, first } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/table";
import { PriorityBadge, RevisionBadge } from "@/components/portal/common";
import { RevisionRow } from "@/components/admin/project-panels";
import { timeAgo } from "@/lib/format";

export async function RevisionsBoard({ actor, sp, base }: { actor: Actor; sp: Record<string, string | string[] | undefined>; base: "/admin" | "/editor" }) {
  const tab = first(sp.tab) ?? "open";
  const rows = await guard(() => listRevisions(actor, { status: tab === "open" ? "open" : undefined }));
  const canManage = can(actor, "revisions:manage");
  return (
    <>
      <PageHeader title="Revisions" description="Feedback rounds waiting on an editor, across every project." />
      <TabNav basePath={`${base}/revisions`} active={tab} tabs={[{ key: "open", label: "Open" }, { key: "all", label: "All" }]} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon="refresh" title="No revision requests" description="When clients request changes they show up here with the exact timestamps." />}
          columns={[
            { key: "p", header: "Project", primary: true, render: (r) => <Link className="font-bold hover:underline" href={`${base}/projects/${r.project?.id}/review/${r.versionId}`}>{r.project?.name}<span className="block text-xs font-normal text-muted">{r.project?.code} · Round {r.roundNumber} · {r.versionLabel}</span></Link> },
            { key: "d", header: "Request", hideOnMobile: true, render: (r) => <span className="line-clamp-2 max-w-md text-muted">{r.description || "Timestamped notes"} ({r.commentCount ?? 0})</span> },
            { key: "pr", header: "Priority", hideOnMobile: true, render: (r) => <PriorityBadge value={r.priority} /> },
            { key: "s", header: "Status", render: (r) => <RevisionBadge value={r.status} /> },
            { key: "w", header: "Requested", hideOnMobile: true, render: (r) => <span className="text-muted">{timeAgo(r.createdAt)}</span> },
            { key: "a", header: "", align: "right", render: (r) => <RevisionRow id={r.id} status={r.status} canManage={canManage} /> },
          ]}
        />
      </Card>
    </>
  );
}
