import { requirePageActor } from "@/server/auth/actor";
import { listContactSubmissions } from "@/server/services/leads";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/table";
import { SubmissionActions } from "@/components/admin/submission-actions";
import { formatDateTime, timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Submissions", path: "/admin/submissions", noindex: true });

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/submissions");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "no";
  const res = await guard(() => listContactSubmissions(actor, { handled: tab === "all" ? undefined : tab, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Contact submissions" description="Messages from the website contact form. Turn any of them into a lead in one click." />
      <TabNav basePath="/admin/submissions" active={tab} tabs={[{ key: "no", label: "To handle" }, { key: "yes", label: "Handled" }, { key: "all", label: "All" }]} />
      {!res.items.length ? (
        <Card><EmptyState icon="mail" title={tab === "no" ? "Nothing waiting" : "No messages"} description="New contact-form messages appear here and in your notifications." /></Card>
      ) : (
        <ul className="space-y-3">
          {res.items.map((s) => (
            <li key={s.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><b>{s.name}</b><a className="text-sm text-accent hover:underline" href={`mailto:${s.email}`}>{s.email}</a>{s.phone ? <span className="text-sm text-muted">{s.phone}</span> : null}<Badge tone="neutral" dot={false} icon={false}>{s.reason.toLowerCase().replace(/_/g, " ")}</Badge>{s.handled ? <Badge tone="success">Handled</Badge> : <Badge tone="warning">New</Badge>}</div>
                    {s.company ? <div className="text-xs text-muted">{s.company}</div> : null}
                  </div>
                  <span className="text-xs text-subtle" title={formatDateTime(s.createdAt)}>{timeAgo(s.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{s.message}</p>
                <div className="mt-3 border-t border-line pt-3"><SubmissionActions id={s.id} handled={s.handled} leadId={s.leadId} /></div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/submissions" params={{ tab: tab === "no" ? undefined : tab }} />
    </>
  );
}
