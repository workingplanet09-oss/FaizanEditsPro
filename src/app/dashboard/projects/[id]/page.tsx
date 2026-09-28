import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { guard, first, type SearchParams } from "@/server/page";
import { getProjectDetail, projectDocuments, projectMilestones, projectTimeline } from "@/server/services/projects";
import { listAssets, listFolders, listDeliverables } from "@/server/services/assets";
import { listVersions, getVersionPoster, listRevisions } from "@/server/services/reviews";
import { listMessages } from "@/server/services/messages";
import { listChangeRequests, listFileRequests } from "@/server/services/requests";
import { getFeedbackState } from "@/server/services/testimonials";
import { orgRoleCan } from "@/lib/permissions";
import { Card, CardHeader, EmptyState, Meta } from "@/components/ui/primitives";
import { Badge, Avatar } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Icon } from "@/components/ui/icon";
import { TabNav } from "@/components/ui/tabs";
import { ActivityFeed, ClientStepper, ContractBadge, InvoiceBadge, PaymentBadge, QuoteBadge, RevisionBadge, StatusBadge } from "@/components/portal/common";
import { FileManager } from "@/components/portal/file-manager";
import { MessageThread, type Msg } from "@/components/portal/message-thread";
import { ChangeRequestForm, FeedbackForm } from "@/components/portal/project-forms";
import { DeliveryList } from "@/components/portal/delivery-list";
import { formatDate, formatDateShort, formatTimecode, relativeDeadline, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { STATUS_META, type ProjectStatusKey } from "@/lib/statuses";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: "Project", robots: { index: false, follow: false } };
}

type Detail = Awaited<ReturnType<typeof getProjectDetail>>;
type Docs = Awaited<ReturnType<typeof projectDocuments>>;

export default async function ClientProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePageActor("client", `/dashboard/projects/${id}`);
  const p = await guard(() => getProjectDetail(actor, id));
  const [docs, versions, fileRequests] = await Promise.all([guard(() => projectDocuments(actor, id)), listVersions(actor, id), listFileRequests(actor, id, { openOnly: true })]);
  const latest = versions[0];
  const status = p.status;
  const org = p.organization.id;
  const can = { upload: orgRoleCan(actor.orgs.find((o) => o.organizationId === org)?.role ?? "MEMBER", "upload"), manage: orgRoleCan(actor.orgs.find((o) => o.organizationId === org)?.role ?? "MEMBER", "manage_projects") };

  const delivered = ["APPROVED", "DELIVERED", "ARCHIVED"].includes(status);
  const tab = first(sp.tab) ?? "overview";
  const production = !["INQUIRY", "AWAITING_QUOTE", "AWAITING_CONTRACT", "AWAITING_PAYMENT"].includes(status);
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "timeline", label: "Timeline" },
    { key: "files", label: "Files", count: p.counts.assets, alert: p.counts.openFileRequests > 0 || status === "AWAITING_ASSETS" },
    { key: "versions", label: "Videos", count: p.counts.versions, alert: ["CLIENT_REVIEW", "FINAL_REVIEW"].includes(status) },
    { key: "messages", label: "Messages" },
    { key: "billing", label: "Billing", count: docs.invoices.length + docs.quotes.length + docs.contracts.length },
    ...(delivered ? [{ key: "delivery", label: "Delivery", alert: status === "DELIVERED" }, { key: "feedback", label: "Feedback" }] : []),
    ...(production ? [{ key: "changes", label: "Change requests" }] : []),
  ];

  // What should the client do next?
  const openInvoice = docs.invoices.find((i) => ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status));
  const openContract = docs.contracts.find((c) => ["SENT", "VIEWED"].includes(c.status));
  const openQuote = docs.quotes.find((q) => ["SENT", "VIEWED"].includes(q.status));
  let cta: { label: string; href: string; icon: string } | null = null;
  if (openQuote && ["INQUIRY", "AWAITING_QUOTE"].includes(status)) cta = { label: "Review your quote", href: `/dashboard/quotes/${openQuote.id}`, icon: "clipboard" };
  else if (openContract && status === "AWAITING_CONTRACT") cta = { label: "Review & sign contract", href: `/dashboard/contracts/${openContract.id}`, icon: "sign" };
  else if (openInvoice && ["AWAITING_PAYMENT", "APPROVED"].includes(status)) cta = { label: `Pay ${formatMoney(openInvoice.total - openInvoice.amountPaid, openInvoice.currency)}`, href: `/dashboard/invoices/${openInvoice.id}`, icon: "card" };
  else if (status === "ONBOARDING") cta = { label: "Complete project setup", href: `/dashboard/projects/${id}/setup`, icon: "rocket" };
  else if (status === "AWAITING_ASSETS") cta = { label: "Upload your files", href: `/dashboard/projects/${id}?tab=files`, icon: "upload" };
  else if (["CLIENT_REVIEW", "FINAL_REVIEW"].includes(status) && latest) cta = { label: `Review ${latest.label}`, href: `/dashboard/projects/${id}/review/${latest.id}`, icon: "play" };
  else if (["APPROVED", "DELIVERED"].includes(status)) cta = { label: status === "DELIVERED" ? "Download final files" : "See delivery status", href: `/dashboard/projects/${id}?tab=delivery`, icon: "download" };

  const meta = STATUS_META[status];

  return (
    <>
      <div className="mb-2"><Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> All projects</Link></div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-subtle"><span>{p.code}</span>{p.service ? <span>· {p.service.title}</span> : null}</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} audience="client" />
            {p.deadline && !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(status) ? <Badge tone="neutral" icon="calendar">{relativeDeadline(p.deadline)} · {formatDateShort(p.deadline)}</Badge> : null}
            {p.paymentState !== "NONE" ? <PaymentBadge state={p.paymentState} /> : null}
          </div>
        </div>
        {cta ? <ButtonLink href={cta.href} icon={cta.icon} size="lg" className="shrink-0">{cta.label}</ButtonLink> : null}
      </div>

      <Card className="mb-6 p-5 sm:p-6">
        <ClientStepper status={status} />
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Right now</div><p className="mt-1 text-sm font-medium">{meta.clientNow}</p></div>
          <div><div className="text-xs font-bold uppercase tracking-wider text-subtle">Next</div><p className="mt-1 text-sm font-medium">{meta.clientNext}</p></div>
        </div>
      </Card>

      <TabNav tabs={tabs} active={tab} basePath={`/dashboard/projects/${id}`} />

      {tab === "overview" ? <Overview p={p} docs={docs} actorId={actor.userId} projectId={id} /> : null}
      {tab === "timeline" ? <Timeline projectId={id} actor={actor} /> : null}
      {tab === "files" ? <Files projectId={id} actor={actor} sp={sp} status={status} canUpload={can.upload} fileRequests={fileRequests} /> : null}
      {tab === "versions" ? <Versions projectId={id} actor={actor} versions={versions} status={status} /> : null}
      {tab === "messages" ? <Messages projectId={id} actor={actor} /> : null}
      {tab === "billing" ? <Billing docs={docs} /> : null}
      {tab === "delivery" && delivered ? <Delivery projectId={id} actor={actor} status={status} /> : null}
      {tab === "feedback" && delivered ? <Feedback projectId={id} actor={actor} /> : null}
      {tab === "changes" && production ? <Changes projectId={id} actor={actor} canManage={can.manage} locked={p.brief?.status === "LOCKED"} /> : null}
    </>
  );
}

// ───────────────────────── tabs ─────────────────────────

function Overview({ p, docs, projectId }: { p: Detail; docs: Docs; actorId: string; projectId: string }) {
  const status = p.status as ProjectStatusKey;
  const gate = p.gate;
  const steps = [
    { label: "Quote accepted", done: gate.quoteAccepted },
    { label: "Contract signed", done: gate.contractSigned },
    { label: "Deposit paid", done: gate.depositPaid },
    { label: "Final payment", done: gate.allPaid && docs.invoices.length > 0 },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <MilestoneCard projectId={projectId} />
        {p.brief ? (
          <Card>
            <CardHeader title="Project brief" description={p.brief.status === "LOCKED" ? "Locked — production has started. Use change requests for anything new." : `Version ${p.brief.version}`} action={p.brief.status !== "LOCKED" && ["ONBOARDING", "AWAITING_ASSETS", "QUEUED"].includes(status) ? <ButtonLink href={`/dashboard/projects/${projectId}/setup`} size="sm" variant="outline" icon="pencil">Edit</ButtonLink> : null} />
            <div className="grid gap-x-8 gap-y-5 px-5 pb-6 sm:grid-cols-2">
              {p.brief.content.sections.slice(0, 6).map((s: any) => (
                <div key={s.key}>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">{s.label}</h4>
                  <dl className="space-y-1.5">
                    {s.items.slice(0, 5).map((i: any) => (
                      <div key={i.label} className="text-sm"><dt className="inline text-muted">{i.label}: </dt><dd className="inline font-medium">{String(i.value).slice(0, 120)}</dd></div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
      <aside className="space-y-6">
        <Card>
          <CardHeader title="Details" />
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
            <Meta label="Deadline">{p.deadline ? formatDate(p.deadline) : "Set after payment"}</Meta>
            <Meta label="Revisions">{p.revisionsUsed} of {p.revisionLimit} used</Meta>
            <Meta label="Started">{p.startDate ? formatDate(p.startDate) : null}</Meta>
            <Meta label="Delivered">{p.deliveredAt ? formatDate(p.deliveredAt) : null}</Meta>
            <Meta label="Service" className="col-span-2">{p.service?.title}</Meta>
            {p.scope.deliverables.length ? <Meta label="Deliverables" className="col-span-2">{p.scope.deliverables.map((d) => `${d.quantity}× ${d.label}`).join(", ")}</Meta> : null}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Your team" />
          <ul className="space-y-3 px-5 pb-5">
            {p.manager ? <li className="flex items-center gap-3"><Avatar name={p.manager.name} size={32} /><div><div className="text-sm font-bold">{p.manager.name}</div><div className="text-xs text-subtle">Project manager</div></div></li> : null}
            {p.members.filter((m) => m.role !== "MANAGER").map((m) => (
              <li key={m.id} className="flex items-center gap-3"><Avatar name={m.user.name} size={32} /><div><div className="text-sm font-bold">{m.user.name}</div><div className="text-xs capitalize text-subtle">{m.role.replace("_", " ").toLowerCase()}</div></div></li>
            ))}
            {!p.manager && !p.members.length ? <li className="text-sm text-muted">Your team is assigned once the project starts.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Payment & approvals" />
          <ul className="space-y-2.5 px-5 pb-5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm"><Icon name={s.done ? "check-circle" : "clock"} size={17} className={s.done ? "text-success" : "text-subtle"} /><span className={s.done ? "" : "text-muted"}>{s.label}</span></li>
            ))}
            {gate.outstanding > 0 ? <li className="mt-1 rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">Outstanding: {formatMoney(gate.outstanding, p.currency)}</li> : null}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

async function MilestoneCard({ projectId }: { projectId: string }) {
  const actor = await requirePageActor("client");
  const ms = await projectMilestones(actor, projectId);
  return (
    <Card>
      <CardHeader title="Progress tracker" description="Every step, with who did it and when." />
      <ol className="px-5 pb-5">
        {ms.map((m, i) => (
          <li key={m.key} className="relative flex gap-4 pb-5 last:pb-0">
            {i < ms.length - 1 ? <span aria-hidden className={cn("absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px", m.done ? "bg-fg/25" : "bg-line")} /> : null}
            <span className={cn("z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2", m.done ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-subtle")}>{m.done ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className={cn("text-sm font-bold", !m.done && "text-muted")}>{m.label}</div>
              <div className="text-xs text-subtle">{m.done ? `${formatDateShort(m.at)}${m.by ? ` · ${m.by}` : ""}` : "Upcoming"}</div>
              {m.done && m.comment ? <p className="mt-1 line-clamp-2 text-xs text-muted">{m.comment}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

async function Timeline({ projectId, actor }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>> }) {
  const items = await projectTimeline(actor, projectId, { limit: 80 });
  return (
    <Card>
      <CardHeader title="Activity" description="A complete record of what's happened on this project." />
      <ActivityFeed items={items.map((i) => ({ id: i.id, message: i.message, at: i.at, by: i.by }))} showProject={false} />
    </Card>
  );
}

async function Files({ projectId, actor, sp, status, canUpload, fileRequests }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>>; sp: Record<string, string | string[] | undefined>; status: ProjectStatusKey; canUpload: boolean; fileRequests: Awaited<ReturnType<typeof listFileRequests>> }) {
  const folder = first(sp.folder);
  const [folders, list] = await Promise.all([listFolders(actor, projectId), listAssets(actor, projectId, { folderKey: folder })]);
  const closed = ["DELIVERED", "ARCHIVED", "CANCELLED"].includes(status);
  return (
    <div className="space-y-6">
      {status === "AWAITING_ASSETS" ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-accent/40 bg-accent-soft/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-extrabold">Upload your footage and assets</h3><p className="mt-1 text-sm text-muted">When everything is in, tell us — your project moves to the editing queue straight away.</p></div>
          <ActionButton url={`/api/projects/${projectId}/assets-ready`} success="Great — your project is queued for an editor" confirm={{ title: "Everything uploaded?", description: "We'll queue your project for an editor. You can still add files later, but the edit starts from what's here now.", confirmLabel: "Yes, start my project" }} variant="dark" icon="check-circle" disabled={!canUpload}>I've uploaded everything</ActionButton>
        </div>
      ) : null}
      <FileManager
        projectId={projectId}
        files={list.items.map((f) => ({ ...f, project: null }))}
        folders={folders}
        activeFolder={folder}
        basePath={`/dashboard/projects/${projectId}`}
        extraParams={{ tab: "files" }}
        canUpload={canUpload && !closed}
        canDelete={canUpload && !closed}
        canShare={false}
        fileRequests={fileRequests}
      />
    </div>
  );
}

async function Versions({ projectId, actor, versions, status }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>>; versions: Awaited<ReturnType<typeof listVersions>>; status: ProjectStatusKey }) {
  const posters = await Promise.all(versions.map((v) => getVersionPoster(actor, v.id).then((r) => r.url).catch(() => null)));
  const revisions = await listRevisions(actor, { projectId });
  if (!versions.length) return <Card><EmptyState icon="film" title="No drafts yet" description={STATUS_META[status].clientNext} /></Card>;
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {versions.map((v, i) => (
          <Link key={v.id} href={`/dashboard/projects/${projectId}/review/${v.id}`} className="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="relative aspect-video bg-surface-2">
              {posters[i] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={posters[i]!} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-subtle"><Icon name="film" size={32} /></div>}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black"><Icon name="play" size={22} /></span></span>
              {v.durationMs ? <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{formatTimecode(v.durationMs)}</span> : null}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="text-base font-extrabold">{v.label}{v.isFinal ? " · Final" : ""}</h3><VersionBadge s={v.reviewStatus} /></div>
              <p className="line-clamp-2 text-sm text-muted">{v.changeSummary || v.notes || "No notes."}</p>
              <div className="flex items-center justify-between text-xs text-subtle"><span>{timeAgo(v.releasedAt ?? v.createdAt)}</span><span>{v.counts ? `${v.counts.open} open · ${v.counts.resolved} resolved` : ""}</span></div>
            </div>
          </Link>
        ))}
      </div>
      {revisions.length ? (
        <Card>
          <CardHeader title="Revision rounds" description="Each round is a batch of timestamped notes you sent." />
          <ul className="divide-y divide-line">
            {revisions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0"><div className="text-sm font-bold">Round {r.roundNumber} · {r.versionLabel}</div><div className="truncate text-xs text-muted">{r.description || "Timestamped notes"} · {r.commentCount ?? 0} note{r.commentCount === 1 ? "" : "s"}</div></div>
                <div className="flex items-center gap-3"><span className="text-xs text-subtle">{timeAgo(r.createdAt)}</span><RevisionBadge value={r.status} /></div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function VersionBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; tone: "warning" | "success" | "neutral" | "info" | "danger" }> = { PENDING_CLIENT: { label: "Awaiting your review", tone: "warning" }, APPROVED: { label: "Approved", tone: "success" }, CHANGES_REQUESTED: { label: "Changes requested", tone: "info" }, SUPERSEDED: { label: "Replaced", tone: "neutral" }, DRAFT: { label: "Draft", tone: "neutral" }, INTERNAL_REVIEW: { label: "Internal", tone: "neutral" } };
  const m = map[s] ?? { label: s, tone: "neutral" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

async function Messages({ projectId, actor }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>> }) {
  const items = await listMessages(actor, { projectId, markRead: true });
  return <MessageThread projectId={projectId} initial={items as unknown as Msg[]} />;
}

function Billing({ docs }: { docs: Docs }) {
  const empty = !docs.quotes.length && !docs.contracts.length && !docs.invoices.length;
  if (empty) return <Card><EmptyState icon="receipt" title="No billing documents yet" description="Your quote, contract and invoices will appear here as soon as they're ready." /></Card>;
  return (
    <div className="space-y-6">
      {docs.quotes.length ? (
        <DocList title="Quotes" rows={docs.quotes.map((q) => ({ id: q.id, href: `/dashboard/quotes/${q.id}`, title: q.number, sub: q.title ?? "", right: formatMoney(q.total, q.currency), badge: <QuoteBadge value={q.status} />, at: q.createdAt }))} />
      ) : null}
      {docs.contracts.length ? (
        <DocList title="Contracts" rows={docs.contracts.map((c) => ({ id: c.id, href: `/dashboard/contracts/${c.id}`, title: c.number, sub: c.title, right: c.signedAt ? `Signed ${formatDateShort(c.signedAt)}` : "", badge: <ContractBadge value={c.status} />, at: c.createdAt }))} />
      ) : null}
      {docs.invoices.length ? (
        <DocList title="Invoices" rows={docs.invoices.map((i) => ({ id: i.id, href: `/dashboard/invoices/${i.id}`, title: i.number, sub: `${i.kind.charAt(0)}${i.kind.slice(1).toLowerCase()}${i.dueDate ? ` · due ${formatDateShort(i.dueDate)}` : ""}`, right: formatMoney(i.total, i.currency), badge: <InvoiceBadge value={i.status} />, at: i.createdAt }))} />
      ) : null}
    </div>
  );
}

function DocList({ title, rows }: { title: string; rows: { id: string; href: string; title: string; sub: string; right: string; badge: React.ReactNode; at: Date }[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2/60">
              <div className="min-w-0 flex-1"><div className="text-sm font-bold">{r.title}</div><div className="truncate text-xs text-muted">{r.sub}</div></div>
              <div className="hidden text-sm font-semibold tabular-nums sm:block">{r.right}</div>
              {r.badge}
              <Icon name="chevron-right" size={16} className="text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Delivery({ projectId, actor, status }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>>; status: ProjectStatusKey }) {
  const d = await listDeliverables(actor, projectId);
  return <DeliveryList items={d.items} unlocked={d.unlocked} lockedReason={d.lockedReason} status={status} projectId={projectId} />;
}

async function Feedback({ projectId, actor }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>> }) {
  const f = await getFeedbackState(actor, projectId);
  if (f.submitted) {
    return (
      <Card className="p-8 text-center">
        <Icon name="check-circle" size={30} className="mx-auto text-success" />
        <h3 className="mt-3 text-lg font-extrabold">Feedback received — thank you!</h3>
        <p className="mt-1 text-sm text-muted">You rated this project {f.submitted.rating}/5 on {formatDate(f.submitted.createdAt)}.</p>
      </Card>
    );
  }
  return <div className="max-w-2xl"><FeedbackForm projectId={projectId} defaults={f.defaults} /></div>;
}

async function Changes({ projectId, actor, canManage, locked }: { projectId: string; actor: Awaited<ReturnType<typeof requirePageActor>>; canManage: boolean; locked: boolean }) {
  const list = await listChangeRequests(actor, projectId);
  const CLASS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = { PENDING: { label: "In review", tone: "info" }, INCLUDED: { label: "Included", tone: "success" }, OUT_OF_SCOPE: { label: "Out of scope", tone: "neutral" }, ADDITIONAL_COST: { label: "Needs a quote", tone: "warning" } };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
      <div>
        {list.length ? (
          <ul className="space-y-3">
            {list.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{c.whatChanged}</p><Badge tone={CLASS[c.classification]?.tone ?? "neutral"}>{CLASS[c.classification]?.label ?? c.classification}</Badge></div>
                {c.why ? <p className="mt-1.5 text-sm text-muted">{c.why}</p> : null}
                {c.staffNote ? <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm"><b>Studio:</b> {c.staffNote}</p> : null}
                <p className="mt-3 text-xs text-subtle">{c.submittedBy.name} · {timeAgo(c.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Card><EmptyState icon="pencil" title="No change requests" description={locked ? "The brief is locked because production has started. If something changes, send a change request and we'll confirm scope and cost." : "Send a request here if the scope changes after production starts."} /></Card>
        )}
      </div>
      {canManage ? <ChangeRequestForm projectId={projectId} /> : <p className="text-sm text-muted">Only project managers on your team can submit change requests.</p>}
    </div>
  );
}

void formatTimecode;
