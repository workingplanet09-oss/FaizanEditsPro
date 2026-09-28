import { requirePageActor } from "@/server/auth/actor";
import { listAuditLog } from "@/server/services/admin";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, FilterBar, Pagination } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Audit log", path: "/admin/audit-log", noindex: true });

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/audit-log");
  const sp = await searchParams;
  const f = { q: first(sp.q), entityType: first(sp.entityType) };
  const res = await guard(() => listAuditLog(actor, { ...f, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of sensitive actions: sign-ins, status overrides, payments, approvals, deletions and setting changes. Entries can't be edited or removed." />
      <Card>
        <FilterBar action="/admin/audit-log" values={f} fields={[{ name: "q", label: "Search log", placeholder: "Search message, action or person…" }, { name: "entityType", label: "Entity", type: "select", options: ["project", "invoice", "payment", "quote", "contract", "lead", "client", "user", "video_version", "asset", "setting", "automation"].map((v) => ({ value: v, label: v.replace("_", " ") })) }]} />
        <DataTable
          rows={res.items}
          rowKey={(r) => r.id}
          empty={<EmptyState icon="shield" title="No matching entries" description="Actions are recorded here as they happen." />}
          columns={[
            { key: "t", header: "When", primary: true, render: (r) => <span className="whitespace-nowrap font-semibold">{formatDateTime(r.createdAt)}</span> },
            { key: "a", header: "Who", render: (r) => r.actorLabel ?? "System" },
            { key: "m", header: "What happened", render: (r) => <span><span className="block">{r.message}</span><span className="font-mono text-[11px] text-subtle">{r.action}{r.ip ? ` · ${r.ip}` : ""}</span></span> },
            { key: "e", header: "Entity", hideOnMobile: true, render: (r) => <span className="text-muted">{r.entityType ?? "—"}</span> },
          ]}
        />
        <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/audit-log" params={f} />
      </Card>
    </>
  );
}
