import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard, first, type SearchParams } from "@/server/page";
import { clientLifetime, getBrandKit, getClientOrThrow, listBrandAssets, onboardingChecklist } from "@/server/services/clients";
import { listProjectsStaff, listAssignable } from "@/server/services/projects";
import { listInvoices } from "@/server/services/invoices";
import { listQuotes } from "@/server/services/quotes";
import { listRetainers } from "@/server/services/retainers";
import { listNotes } from "@/server/services/notes";
import { listMessages } from "@/server/services/messages";
import { Card, CardHeader, EmptyState, Meta, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TabNav } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/table";
import { ClientStatusBadge, InvoiceBadge, PaymentBadge, QuoteBadge, RetainerBadge, StatusBadge } from "@/components/portal/common";
import { ClientToolbar } from "@/components/admin/client-actions";
import { NotesPanel } from "@/components/admin/notes-panel";
import { MessageThread, type Msg } from "@/components/portal/message-thread";
import { MoneyMap } from "@/components/portal/money-map";
import { FileManager } from "@/components/portal/file-manager";
import { formatDate, formatDateShort, relativeDeadline } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Client", robots: { index: false, follow: false } };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePageActor("admin", `/admin/clients/${id}`);
  const tab = first(sp.tab) ?? "overview";
  const c = await guard(() => getClientOrThrow(actor, id));
  const [life, staff, projects] = await Promise.all([clientLifetime(id), can(actor, "projects:assign") ? listAssignable(actor) : [], can(actor, "projects:read_all") || can(actor, "projects:read_assigned") ? listProjectsStaff(actor, { clientId: id, pageSize: 50 }) : { items: [], total: 0 }]);
  const canWrite = can(actor, "clients:write");
  return (
    <>
      <div className="mb-2"><Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Clients</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.companyName}<ClientStatusBadge value={c.status} /></span>}
        description={[c.name, c.email, c.phone].filter(Boolean).join(" · ")}
        actions={<>{can(actor, "projects:write") ? <ButtonLink href={`/admin/projects/new?clientId=${id}`} icon="plus" variant="dark">New project</ButtonLink> : null}{can(actor, "invoices:write") ? <ButtonLink href={`/admin/invoices/new?clientId=${id}`} icon="receipt" variant="outline">New invoice</ButtonLink> : null}</>}
      />
      <div className="mb-6"><ClientToolbar canWrite={canWrite} staff={staff} client={{ id, name: c.name, email: c.email, phone: c.phone ?? "", companyName: c.companyName, industry: c.industry ?? "", website: c.website ?? "", country: c.country ?? "", status: c.status, managerId: c.managerId, hasUser: !!c.user }} /></div>
      <TabNav basePath={`/admin/clients/${id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "projects", label: "Projects", count: projects.total }, { key: "billing", label: "Billing" }, { key: "files", label: "Files & brand" }, { key: "messages", label: "Messages" }, { key: "notes", label: "Notes" }]} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_24rem]">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-4"><div className="text-xs font-medium text-muted">Lifetime revenue</div><div className="mt-1.5 text-2xl font-extrabold tabular-nums"><MoneyMap value={life.revenue} /></div></Card>
              <Card className="p-4"><div className="text-xs font-medium text-muted">Projects</div><div className="mt-1.5 text-2xl font-extrabold tabular-nums">{life.totalProjects}</div><div className="text-xs text-subtle">{life.activeProjects} active</div></Card>
              <Card className="p-4"><div className="text-xs font-medium text-muted">Avg. project value</div><div className="mt-1.5 text-2xl font-extrabold tabular-nums"><MoneyMap value={life.averageProjectValue} /></div></Card>
            </div>
            <Card>
              <CardHeader title="Company" />
              <dl className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-3">
                <Meta label="Industry">{c.industry}</Meta><Meta label="Country">{c.country}</Meta><Meta label="Time zone">{c.timezone}</Meta>
                <Meta label="Website">{c.website ? <a className="text-accent-text hover:underline" href={c.website} target="_blank" rel="noreferrer">{c.website}</a> : null}</Meta>
                <Meta label="Source">{c.source}</Meta><Meta label="Client since">{formatDate(c.createdAt)}</Meta>
                <Meta label="Portal user">{c.user ? `${c.user.name} · ${c.user.status.toLowerCase()}${c.user.lastLoginAt ? `, last seen ${formatDateShort(c.user.lastLoginAt)}` : ""}` : "Not invited yet"}</Meta>
                <Meta label="Referral code">{c.referralCode}</Meta><Meta label="Account manager">{c.manager?.name}</Meta>
                <Meta label="Billing email">{c.organization.billingEmail}</Meta><Meta label="Last project">{life.lastProject ? <Link className="hover:underline" href={`/admin/projects/${life.lastProject.id}`}>{life.lastProject.name}</Link> : null}</Meta>
              </dl>
            </Card>
            {life.currentRetainer ? <Card className="p-5"><div className="flex items-center gap-3"><Icon name="repeat" size={18} /><div className="flex-1"><div className="font-bold">{life.currentRetainer.name}</div><div className="text-xs text-muted">{formatMoney(life.currentRetainer.monthlyPrice, life.currentRetainer.currency)} / month · renews {formatDate(life.currentRetainer.renewalDate)}</div></div><Link className="text-sm font-semibold text-accent-text hover:underline" href="/admin/retainers">Manage</Link></div></Card> : null}
          </div>
          <aside className="space-y-6">
            <Checklist clientId={id} actor={actor} />
          </aside>
        </div>
      ) : null}

      {tab === "projects" ? (
        <Card>
          <DataTable
            rows={projects.items}
            rowKey={(p) => p.id}
            rowHref={(p) => `/admin/projects/${p.id}`}
            empty={<EmptyState icon="film" title="No projects yet" description="Create the first project for this client." action={can(actor, "projects:write") ? <ButtonLink href={`/admin/projects/new?clientId=${id}`}>New project</ButtonLink> : undefined} />}
            columns={[
              { key: "n", header: "Project", primary: true, render: (p) => <span><span className="font-bold">{p.name}</span><span className="block text-xs font-normal text-muted">{p.code}</span></span> },
              { key: "s", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
              { key: "d", header: "Deadline", hideOnMobile: true, render: (p) => (p.deadline ? relativeDeadline(p.deadline) : "—") },
              { key: "e", header: "Editor", hideOnMobile: true, render: (p) => p.editors.map((e) => e.name).join(", ") || "—" },
              { key: "pay", header: "Payment", hideOnMobile: true, render: (p) => <PaymentBadge state={p.paymentState} /> },
            ]}
          />
        </Card>
      ) : null}

      {tab === "billing" ? <BillingTab clientId={id} actor={actor} /> : null}
      {tab === "files" ? <FilesTab clientId={id} actor={actor} canWrite={canWrite} /> : null}
      {tab === "messages" ? <MessagesTab clientId={id} actor={actor} /> : null}
      {tab === "notes" && can(actor, "notes:read") ? <div className="max-w-2xl"><NotesPanel entityType="CLIENT" entityId={id} notes={(await listNotes(actor, "CLIENT", id)) as any} canWrite={can(actor, "notes:write")} /></div> : null}
    </>
  );
}

type Actor = Awaited<ReturnType<typeof requirePageActor>>;

async function Checklist({ clientId, actor }: { clientId: string; actor: Actor }) {
  const cl = await onboardingChecklist(actor, clientId);
  return (
    <Card>
      <CardHeader title="Onboarding checklist" description={`${cl.done} of ${cl.total} complete`} />
      <ul className="space-y-2 px-5 pb-5">{cl.items.map((i) => <li key={i.key} className="flex items-center gap-2.5 text-sm"><Icon name={i.done ? "check-circle" : "clock"} size={16} className={i.done ? "text-success" : "text-subtle"} /><span className={i.done ? "text-muted" : "font-medium"}>{i.label}</span></li>)}</ul>
    </Card>
  );
}

async function BillingTab({ clientId, actor }: { clientId: string; actor: Actor }) {
  const [inv, quotes, retainers] = await Promise.all([can(actor, "invoices:read") ? listInvoices(actor, { clientId, pageSize: 50 }) : { items: [] as any[] }, can(actor, "quotes:read") ? listQuotes(actor, { clientId, pageSize: 50 }) : { items: [] as any[] }, listRetainers(actor, { clientId }).catch(() => [])]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Invoices" />
        <DataTable rows={inv.items} rowKey={(i: any) => i.id} rowHref={(i: any) => `/admin/invoices/${i.id}`} empty={<p className="px-5 pb-6 text-sm text-muted">No invoices yet.</p>} columns={[{ key: "n", header: "Invoice", primary: true, render: (i: any) => <span className="font-bold">{i.number}</span> }, { key: "p", header: "Project", hideOnMobile: true, render: (i: any) => i.project?.name ?? "—" }, { key: "s", header: "Status", render: (i: any) => <InvoiceBadge value={i.status} /> }, { key: "a", header: "Amount", align: "right", render: (i: any) => <span className="font-semibold tabular-nums">{formatMoney(i.total, i.currency)}</span> }]} />
      </Card>
      <Card>
        <CardHeader title="Quotes" />
        <DataTable rows={quotes.items} rowKey={(q: any) => q.id} rowHref={(q: any) => `/admin/quotes/${q.id}`} empty={<p className="px-5 pb-6 text-sm text-muted">No quotes yet.</p>} columns={[{ key: "n", header: "Quote", primary: true, render: (q: any) => <span className="font-bold">{q.number}</span> }, { key: "p", header: "Project", hideOnMobile: true, render: (q: any) => q.project?.name ?? q.title ?? "—" }, { key: "s", header: "Status", render: (q: any) => <QuoteBadge value={q.status} /> }, { key: "a", header: "Total", align: "right", render: (q: any) => <span className="font-semibold tabular-nums">{formatMoney(q.total, q.currency)}</span> }]} />
      </Card>
      {retainers.length ? <Card><CardHeader title="Retainers" /><ul className="divide-y divide-line">{retainers.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-bold">{r.name}</span><span className="tabular-nums">{formatMoney(r.monthlyPrice, r.currency)}/mo</span><RetainerBadge value={r.status} /></li>)}</ul></Card> : null}
    </div>
  );
}

async function FilesTab({ clientId, actor, canWrite }: { clientId: string; actor: Actor; canWrite: boolean }) {
  const [kit, assets] = await Promise.all([getBrandKit(actor, clientId), listBrandAssets(actor, clientId)]);
  const colors = (kit.colors as { name: string; hex: string }[]) ?? [];
  const fonts = (kit.fonts as { name: string; usage?: string }[]) ?? [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Brand kit" description="Maintained by the client; you can edit it too." />
        <div className="grid grid-cols-1 gap-6 px-5 pb-6 md:grid-cols-2">
          <div><h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Colours</h4>{colors.length ? <ul className="flex flex-wrap gap-3">{colors.map((c) => <li key={c.hex + c.name} className="flex items-center gap-2 text-sm"><span className="h-7 w-7 rounded-lg border border-line" style={{ background: c.hex }} />{c.name || c.hex}<span className="font-mono text-xs text-subtle">{c.hex}</span></li>)}</ul> : <p className="text-sm text-muted">None saved.</p>}</div>
          <div><h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Fonts</h4>{fonts.length ? <ul className="space-y-1 text-sm">{fonts.map((f) => <li key={f.name}><b>{f.name}</b> <span className="text-muted">{f.usage}</span></li>)}</ul> : <p className="text-sm text-muted">None saved.</p>}</div>
          {kit.musicPreference ? <div className="md:col-span-2"><h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-subtle">Music</h4><p className="text-sm">{kit.musicPreference}</p></div> : null}
        </div>
      </Card>
      <FileManager files={assets as any} staff canUpload={false} canDelete={canWrite && can(actor, "files:delete")} />
    </div>
  );
}

async function MessagesTab({ clientId, actor }: { clientId: string; actor: Actor }) {
  const items = await listMessages(actor, { clientId, markRead: true });
  return <MessageThread clientId={clientId} initial={items as unknown as Msg[]} staff placeholder="Message the client (visible in their portal)…" />;
}
