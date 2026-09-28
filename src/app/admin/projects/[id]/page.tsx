import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard, first, type SearchParams } from "@/server/page";
import { getProjectDetail, listAssignable, projectDocuments, projectMilestones, projectTimeline } from "@/server/services/projects";
import { listAssets, listDeliverables, listFolders } from "@/server/services/assets";
import { getVersionPoster, listRevisions, listVersions } from "@/server/services/reviews";
import { listMessages } from "@/server/services/messages";
import { listChangeRequests, listFileRequests } from "@/server/services/requests";
import { listNotes } from "@/server/services/notes";
import { listTasks } from "@/server/services/tasks";
import { listTime, myTimer } from "@/server/services/time";
import { getBrief } from "@/server/services/briefs";
import { Badge, Card, CardHeader, EmptyState, Meta, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TabNav } from "@/components/ui/tabs";
import { ActivityFeed, ClientStepper, ContractBadge, InvoiceBadge, PaymentBadge, PriorityBadge, QuoteBadge, RevisionBadge, StatusBadge } from "@/components/portal/common";
import { FileManager } from "@/components/portal/file-manager";
import { DeliveryList } from "@/components/portal/delivery-list";
import { MessageThread, type Msg } from "@/components/portal/message-thread";
import { NotesPanel } from "@/components/admin/notes-panel";
import { TasksPanel } from "@/components/admin/tasks-panel";
import { TimePanel } from "@/components/admin/time-panel";
import { AssignTeam, ChangeRequestReview, DeliverablesAdmin, DuplicateProject, ProjectEdit, RevisionRow, StatusControl, VersionUpload } from "@/components/admin/project-panels";
import { formatDate, formatDateShort, formatTimecode, relativeDeadline, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { STATUS_META, type ProjectStatusKey } from "@/lib/statuses";
import { cn } from "@/lib/cn";

export const metadata = { title: "Project", robots: { index: false, follow: false } };
type Actor = Awaited<ReturnType<typeof requirePageActor>>;

export default async function AdminProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePageActor("admin", `/admin/projects/${id}`);
  const tab = first(sp.tab) ?? "overview";
  const p = await guard(() => getProjectDetail(actor, id));
  const [docs, versions, staff] = await Promise.all([guard(() => projectDocuments(actor, id)), listVersions(actor, id), can(actor, "projects:assign") ? listAssignable(actor) : []]);
  const status = p.status;
  const latest = versions[0];
  const canWrite = can(actor, "projects:write");
  const late = p.deadline && p.deadline < new Date() && !["DELIVERED", "APPROVED", "ARCHIVED", "CANCELLED"].includes(status);
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "brief", label: "Brief", alert: p.brief?.status === "DRAFT" },
    { key: "files", label: "Files", count: p.counts.assets },
    { key: "videos", label: "Videos", count: p.counts.versions },
    { key: "revisions", label: "Revisions", count: p.counts.openRevisions, alert: p.counts.openRevisions > 0 },
    { key: "tasks", label: "Tasks", count: p.counts.openTasks },
    { key: "messages", label: "Messages" },
    { key: "billing", label: "Billing", count: docs.invoices.length + docs.quotes.length + docs.contracts.length },
    { key: "delivery", label: "Delivery" },
    { key: "time", label: "Time" },
    { key: "activity", label: "Activity" },
    { key: "notes", label: "Notes" },
  ];
  return (
    <>
      <div className="mb-2"><Link href="/admin/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Projects</Link></div>
      <PageHeader
        eyebrow={<>{p.code} · <Link className="hover:underline" href={`/admin/clients/${p.client.id}`}>{p.client.companyName}</Link></>}
        title={<span className="flex flex-wrap items-center gap-3">{p.name}<StatusBadge status={status} />{p.priority !== "NORMAL" ? <PriorityBadge value={p.priority} /> : null}</span>}
        description={p.description ?? undefined}
        actions={
          <>
            {latest ? <ButtonLink href={`/admin/projects/${id}/review/${latest.id}`} icon="play" variant="dark">Open review · {latest.label}</ButtonLink> : null}
            {canWrite ? <ProjectEdit project={{ id, name: p.name, description: p.description ?? "", priority: p.priority, deadline: p.deadline ? new Date(p.deadline).toISOString().slice(0, 10) : "", revisionLimit: p.revisionLimit, currency: p.currency }} /> : null}
            {canWrite ? <DuplicateProject projectId={id} /> : null}
          </>
        }
      />
      <Card className="mb-6 p-5">
        <ClientStepper status={status} />
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
          <span className={cn("flex items-center gap-1.5 font-semibold", late && "text-danger")}><Icon name="calendar" size={15} />{p.deadline ? `${relativeDeadline(p.deadline)} · ${formatDateShort(p.deadline)}` : "No deadline"}</span>
          <span className="flex items-center gap-1.5"><Icon name="refresh" size={15} className="text-subtle" />Revisions {p.revisionsUsed}/{p.revisionLimit}</span>
          <PaymentBadge state={p.paymentState} />
          {p.gateOverride ? <Badge tone="danger">Gate override active</Badge> : null}
          <span className="text-muted">{STATUS_META[status].clientNow}</span>
        </div>
      </Card>
      <TabNav basePath={`/admin/projects/${id}`} active={tab} tabs={tabs} />

      {tab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
          <div className="space-y-6">
            {can(actor, "projects:transition") || can(actor, "versions:upload") ? <StatusControl projectId={id} status={status} allowedNext={p.allowedNext as ProjectStatusKey[]} canOverride={can(actor, "deliverables:override")} history={p.history} /> : null}
            <Milestones actor={actor} projectId={id} />
            <Card>
              <CardHeader title="Scope" />
              <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                <Meta label="Deliverables">{p.scope.deliverables.length ? p.scope.deliverables.map((d) => `${d.quantity}× ${d.label}`).join(", ") : null}</Meta>
                <Meta label="Turnaround">{p.scope.turnaroundBusinessDays} business days</Meta>
                <Meta label="Service">{p.service?.title}</Meta>
                <Meta label="Type">{p.projectType?.name}</Meta>
                <Meta label="Categories">{p.scope.categories?.join(", ")}</Meta>
                <Meta label="Started">{p.startDate ? formatDate(p.startDate) : null}</Meta>
                {"internalCost" in p && p.internalCost != null ? <Meta label="Internal cost">{formatMoney(p.internalCost, p.currency)}</Meta> : null}
                {"rushFee" in p && p.rushFee ? <Meta label="Rush fee">{formatMoney(p.rushFee as number, p.currency)}</Meta> : null}
              </dl>
            </Card>
          </div>
          <aside className="space-y-6">
            <AssignTeam projectId={id} staff={staff} canAssign={can(actor, "projects:assign")} current={{ managerId: p.manager?.id ?? null, editorIds: p.members.filter((m) => m.role === "EDITOR").map((m) => m.user.id), motionIds: p.members.filter((m) => m.role === "MOTION_DESIGNER").map((m) => m.user.id), reviewerIds: p.members.filter((m) => m.role === "REVIEWER").map((m) => m.user.id) }} />
            <Card>
              <CardHeader title="Payment gates" />
              <ul className="space-y-2.5 px-5 pb-5 text-sm">
                {[["Quote accepted", p.gate.quoteAccepted], ["Contract signed", p.gate.contractSigned], ["Deposit paid", p.gate.depositPaid], ["Fully paid", p.gate.allPaid]].map(([l, ok]) => <li key={String(l)} className="flex items-center gap-2.5"><Icon name={ok ? "check-circle" : "clock"} size={16} className={ok ? "text-success" : "text-subtle"} /><span className={ok ? "" : "text-muted"}>{l}</span></li>)}
                {p.gate.outstanding > 0 ? <li className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">Outstanding {formatMoney(p.gate.outstanding, p.currency)}</li> : null}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Client contact" />
              <div className="px-5 pb-5 text-sm"><div className="font-bold">{p.client.name}</div><a className="text-accent hover:underline" href={`mailto:${p.client.email}`}>{p.client.email}</a>{p.client.phone ? <div className="text-muted">{p.client.phone}</div> : null}</div>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "brief" ? <BriefTab actor={actor} projectId={id} /> : null}
      {tab === "files" ? <FilesTab actor={actor} projectId={id} sp={sp} /> : null}
      {tab === "videos" ? <VideosTab actor={actor} projectId={id} versions={versions} status={status} canUpload={can(actor, "versions:upload")} /> : null}
      {tab === "revisions" ? <RevisionsTab actor={actor} projectId={id} /> : null}
      {tab === "tasks" ? <TasksTab actor={actor} projectId={id} staff={staff} /> : null}
      {tab === "messages" ? <MessagesTab actor={actor} projectId={id} /> : null}
      {tab === "billing" ? <BillingTab docs={docs} projectId={id} clientId={p.client.id} canInvoice={can(actor, "invoices:write")} canQuote={can(actor, "quotes:write")} /> : null}
      {tab === "delivery" ? <DeliveryTab actor={actor} projectId={id} status={status} /> : null}
      {tab === "time" ? <TimeTab actor={actor} projectId={id} /> : null}
      {tab === "activity" ? <ActivityTab actor={actor} projectId={id} /> : null}
      {tab === "notes" && can(actor, "notes:read") ? <div className="max-w-2xl"><NotesPanel entityType="PROJECT" entityId={id} notes={(await listNotes(actor, "PROJECT", id)) as any} canWrite={can(actor, "notes:write")} /></div> : null}
    </>
  );
}

async function Milestones({ actor, projectId }: { actor: Actor; projectId: string }) {
  const ms = await projectMilestones(actor, projectId);
  return (
    <Card>
      <CardHeader title="Milestones" />
      <ol className="grid gap-x-8 gap-y-3 px-5 pb-5 sm:grid-cols-2">
        {ms.map((m) => <li key={m.key} className="flex items-start gap-3"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", m.done ? "bg-fg text-bg" : "border-2 border-line-strong")}>{m.done ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span><div><div className={cn("text-sm font-semibold", !m.done && "text-muted")}>{m.label}</div><div className="text-xs text-subtle">{m.done ? `${formatDateShort(m.at)}${m.by ? ` · ${m.by}` : ""}` : "Pending"}</div></div></li>)}
      </ol>
    </Card>
  );
}

async function BriefTab({ actor, projectId }: { actor: Actor; projectId: string }) {
  const brief = await getBrief(actor, projectId);
  if (!brief) return <Card><EmptyState icon="clipboard" title="No brief yet" description="The client fills the project brief after payment. It will appear here as a structured summary." /></Card>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm"><Badge tone={brief.status === "LOCKED" ? "neutral" : "info"} icon={brief.status === "LOCKED" ? "lock" : "pencil"}>{brief.status === "LOCKED" ? "Locked (production started)" : `Draft v${brief.version}`}</Badge>{brief.confirmedAt ? <Badge tone="success">Approved by client {formatDateShort(brief.confirmedAt)}</Badge> : <Badge tone="warning">Not yet approved by client</Badge>}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {brief.content.sections.map((s: any) => (
          <Card key={s.key}>
            <CardHeader title={s.label} />
            <dl className="space-y-3 px-5 pb-5">{s.items.map((i: any) => <Meta key={i.label} label={i.label}><span className="whitespace-pre-line">{i.value}</span></Meta>)}</dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function FilesTab({ actor, projectId, sp }: { actor: Actor; projectId: string; sp: Record<string, string | string[] | undefined> }) {
  const folder = first(sp.folder);
  const [folders, list, reqs] = await Promise.all([listFolders(actor, projectId), listAssets(actor, projectId, { folderKey: folder, includeDrafts: true }), listFileRequests(actor, projectId)]);
  return <FileManager staff projectId={projectId} files={list.items.map((f) => ({ ...f, project: null }))} folders={folders} activeFolder={folder} basePath={`/admin/projects/${projectId}`} extraParams={{ tab: "files" }} canUpload={can(actor, "files:write")} canDelete={can(actor, "files:delete")} canShare fileRequests={reqs} />;
}

async function VideosTab({ actor, projectId, versions, status, canUpload }: { actor: Actor; projectId: string; versions: Awaited<ReturnType<typeof listVersions>>; status: ProjectStatusKey; canUpload: boolean }) {
  const posters = await Promise.all(versions.map((v) => getVersionPoster(actor, v.id).then((r) => r.url).catch(() => null)));
  const revs = await listRevisions(actor, { projectId, status: "open" });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <div>
        {versions.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {versions.map((v, i) => (
              <Link key={v.id} href={`/admin/projects/${projectId}/review/${v.id}`} className="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="relative aspect-video bg-surface-2">{posters[i] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={posters[i]!} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-subtle"><Icon name="film" size={30} /></div>}{v.durationMs ? <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{formatTimecode(v.durationMs)}</span> : null}</div>
                <div className="space-y-1.5 p-4"><div className="flex items-center justify-between"><b className="text-base">{v.label}{v.isFinal ? " · Final" : ""}</b><Badge tone={v.reviewStatus === "APPROVED" ? "success" : v.reviewStatus === "PENDING_CLIENT" ? "warning" : "neutral"}>{v.reviewStatus.replace(/_/g, " ").toLowerCase()}</Badge></div><p className="line-clamp-2 text-sm text-muted">{v.changeSummary || v.notes || "—"}</p><div className="flex justify-between text-xs text-subtle"><span>{v.createdBy} · {timeAgo(v.createdAt)}</span><span>{v.counts ? `${v.counts.open} open / ${v.counts.total}` : ""}</span></div></div>
              </Link>
            ))}
          </div>
        ) : <Card><EmptyState icon="film" title="No versions yet" description={["QUEUED", "EDITING", "REVISION", "AWAITING_ASSETS", "INTERNAL_REVIEW"].includes(status) ? "Upload the first cut when it's ready." : "Versions can be uploaded once the project is in production."} /></Card>}
      </div>
      {canUpload ? <VersionUpload projectId={projectId} revisions={revs.map((r) => ({ id: r.id, label: `Round ${r.roundNumber} · ${r.versionLabel ?? ""}` }))} /> : null}
    </div>
  );
}

async function RevisionsTab({ actor, projectId }: { actor: Actor; projectId: string }) {
  const [revs, crs] = await Promise.all([listRevisions(actor, { projectId }), listChangeRequests(actor, projectId)]);
  const canManage = can(actor, "revisions:manage");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Revision rounds" description="Feedback batches sent by the client." />
        {revs.length ? <ul className="divide-y divide-line">{revs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5"><div className="min-w-0 flex-1"><div className="text-sm font-bold">Round {r.roundNumber} · {r.versionLabel}</div><div className="truncate text-xs text-muted">{r.description || "Timestamped notes"} · {r.commentCount ?? 0} note(s) · {timeAgo(r.createdAt)}</div></div><PriorityBadge value={r.priority} /><RevisionBadge value={r.status} /><RevisionRow id={r.id} status={r.status} canManage={canManage} /><Link className="text-xs font-bold text-accent hover:underline" href={`/admin/projects/${projectId}/review/${r.versionId}`}>Open</Link></li>)}</ul> : <EmptyState icon="refresh" title="No revision requests" description="When the client requests changes, each round appears here." />}
      </Card>
      <Card>
        <CardHeader title="Change requests" description="Scope changes after production started." />
        {crs.length ? <ul className="divide-y divide-line">{crs.map((c) => <li key={c.id} className="space-y-1.5 px-5 py-3.5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{c.whatChanged}</p><Badge tone={c.classification === "PENDING" ? "warning" : c.classification === "INCLUDED" ? "success" : "neutral"}>{c.classification.replace("_", " ").toLowerCase()}</Badge></div>{c.why ? <p className="text-xs text-muted">{c.why}</p> : null}<div className="flex items-center justify-between text-xs text-subtle"><span>{c.submittedBy.name} · {timeAgo(c.createdAt)}</span>{can(actor, "projects:write") ? <ChangeRequestReview id={c.id} classification={c.classification} staffNote={c.staffNote} /> : null}</div></li>)}</ul> : <EmptyState icon="pencil" title="No change requests" />}
      </Card>
    </div>
  );
}

async function TasksTab({ actor, projectId, staff }: { actor: Actor; projectId: string; staff: { id: string; name: string }[] }) {
  const res = await listTasks(actor, { projectId, pageSize: 100 });
  return <TasksPanel tasks={res.items as any} staff={staff} projectId={projectId} canWrite={can(actor, "tasks:write")} meId={actor.userId} />;
}

async function MessagesTab({ actor, projectId }: { actor: Actor; projectId: string }) {
  const items = await listMessages(actor, { projectId, markRead: true });
  return <MessageThread projectId={projectId} initial={items as unknown as Msg[]} staff placeholder="Reply to the client (they'll get a notification)…" />;
}

function BillingTab({ docs, projectId, clientId, canInvoice, canQuote }: { docs: Awaited<ReturnType<typeof projectDocuments>>; projectId: string; clientId: string; canInvoice: boolean; canQuote: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {canQuote ? <ButtonLink href={`/admin/quotes/new?clientId=${clientId}&projectId=${projectId}`} icon="clipboard" variant="outline">New quote</ButtonLink> : null}
        {canInvoice ? <ButtonLink href={`/admin/invoices/new?clientId=${clientId}&projectId=${projectId}`} icon="receipt" variant="outline">New invoice</ButtonLink> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Quotes" />{docs.quotes.length ? <ul className="divide-y divide-line">{docs.quotes.map((q) => <li key={q.id}><Link href={`/admin/quotes/${q.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2/60"><span><b>{q.number}</b><span className="block text-xs tabular-nums text-muted">{formatMoney(q.total, q.currency)}</span></span><QuoteBadge value={q.status} /></Link></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">No quotes.</p>}</Card>
        <Card><CardHeader title="Contracts" />{docs.contracts.length ? <ul className="divide-y divide-line">{docs.contracts.map((c) => <li key={c.id}><Link href={`/admin/contracts/${c.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2/60"><span><b>{c.number}</b><span className="block text-xs text-muted">{c.signedAt ? `Signed ${formatDateShort(c.signedAt)}` : "Not signed"}</span></span><ContractBadge value={c.status} /></Link></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">No contracts.</p>}</Card>
        <Card><CardHeader title="Invoices" />{docs.invoices.length ? <ul className="divide-y divide-line">{docs.invoices.map((i) => <li key={i.id}><Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2/60"><span><b>{i.number}</b><span className="block text-xs tabular-nums text-muted">{formatMoney(i.total, i.currency)} · {i.kind.toLowerCase()}</span></span><InvoiceBadge value={i.status} /></Link></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">No invoices.</p>}</Card>
      </div>
    </div>
  );
}

async function DeliveryTab({ actor, projectId, status }: { actor: Actor; projectId: string; status: ProjectStatusKey }) {
  const d = await listDeliverables(actor, projectId);
  const unpublished = d.items.filter((i) => !i.visibleToClient).length;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <DeliveryList items={d.items} unlocked={d.unlocked} lockedReason={d.lockedReason} status={status} projectId={projectId} staff />
      <DeliverablesAdmin projectId={projectId} unpublished={unpublished} canUpload={can(actor, "files:write")} />
    </div>
  );
}

async function TimeTab({ actor, projectId }: { actor: Actor; projectId: string }) {
  if (!can(actor, "time:track")) return <Card><EmptyState icon="timer" title="Time tracking isn't enabled for your role" /></Card>;
  const [entries, running] = await Promise.all([listTime(actor, { projectId }), myTimer(actor)]);
  return <TimePanel projectId={projectId} entries={entries as any} running={running as any} canTrack />;
}

async function ActivityTab({ actor, projectId }: { actor: Actor; projectId: string }) {
  const items = await projectTimeline(actor, projectId, { limit: 100 });
  return <Card><CardHeader title="Activity" description="Client-visible events and internal ones (marked)." /><ActivityFeed items={items} showProject={false} /></Card>;
}

