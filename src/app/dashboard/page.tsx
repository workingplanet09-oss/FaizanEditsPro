import Link from "next/link";
import { clientHome } from "@/server/services/analytics";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ActivityFeed, AttentionList, ProgressRow, ProjectCard } from "@/components/portal/common";
import { formatBytes, formatDate } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { requirePageActor } from "@/server/auth/actor";
import { viewerGreeting } from "@/server/page";

export const metadata = pageMeta({ title: "Dashboard", path: "/dashboard", noindex: true });

export default async function ClientDashboard() {
  const actor = await requirePageActor("client", "/dashboard");
  const home = await clientHome(actor);
  const first = actor.name.split(" ")[0];
  const hello = await viewerGreeting();
  const open = home.projects.filter((p) => !["DELIVERED"].includes(p.status));
  const delivered = home.projects.filter((p) => p.status === "DELIVERED");
  const inReview = home.projects.filter((p) => ["CLIENT_REVIEW", "FINAL_REVIEW"].includes(p.status)).length;

  if (!home.hasProjects) {
    return (
      <>
        <PageHeader title={`${hello}, ${first}`} description="Welcome to your client portal. This is where you'll follow your project from quote to final delivery." />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
          <Card className="p-2">
            <EmptyState
              icon="film"
              title="No projects yet"
              description="Tell us about your video and we'll send a quote. Once you approve it, your project shows up here with a live progress tracker, files, messages and a review player."
              action={<ButtonLink href="/start-project" iconRight="arrow" size="lg">Start your first project</ButtonLink>}
            />
          </Card>
          {home.checklist ? <ChecklistCard checklist={home.checklist} /> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${hello}, ${first}`}
        description={home.attention.length ? `You have ${home.attention.length} thing${home.attention.length === 1 ? "" : "s"} that need${home.attention.length === 1 ? "s" : ""} your attention.` : "You're all caught up — we'll let you know the moment something needs you."}
        actions={<ButtonLink href="/start-project" icon="plus" variant="dark">New project</ButtonLink>}
      />

      <section aria-labelledby="attn" className="mb-8">
        <h2 id="attn" className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          <Icon name="bell" size={15} /> Needs your attention
        </h2>
        {home.attention.length ? (
          <AttentionList items={home.attention} />
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/50 px-5 py-4 text-sm">
            <Icon name="check-circle" size={20} className="text-success" />
            <span><b>All caught up.</b> Nothing is waiting on you right now.</span>
          </div>
        )}
      </section>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active projects" value={open.length} icon="film" href="/dashboard/projects" />
        <Stat label="Ready for review" value={inReview} icon="play" tone={inReview ? "warning" : undefined} sub={inReview ? "Watch and approve" : "Nothing waiting"} />
        <Stat label="Unread messages" value={home.unreadMessages} icon="message" tone={home.unreadMessages ? "accent" : undefined} href="/dashboard/messages" />
        <Stat label="Delivered" value={delivered.length} icon="check-circle" tone="success" sub="Completed projects" href="/dashboard/projects?tab=delivered" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-labelledby="proj">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="proj" className="text-lg font-extrabold tracking-tight">Your projects</h2>
            <Link href="/dashboard/projects" className="text-sm font-semibold text-accent-text hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {open.slice(0, 6).map((p) => <ProjectCard key={p.id} p={p} />)}
            {!open.length ? <Card className="md:col-span-2"><EmptyState icon="film" title="No active projects" description="Everything is delivered. Ready for the next one?" action={<ButtonLink href="/start-project">Start a project</ButtonLink>} /></Card> : null}
          </div>
        </section>

        <aside className="space-y-6">
          {home.retainers.map((r) => (
            <Card key={r.id}>
              <CardHeader title={r.name} description={`Renews ${formatDate(r.renewalDate)}`} />
              <div className="space-y-4 px-5 pb-5">
                {r.included.videos ? <ProgressRow label="Videos" used={r.used.videos} total={r.included.videos} /> : null}
                {r.included.shorts ? <ProgressRow label="Short-form" used={r.used.shorts} total={r.included.shorts} /> : null}
                {r.included.hours ? <ProgressRow label="Hours" used={r.used.hours} total={r.included.hours} /> : null}
                <Link href="/dashboard/retainers" className="text-sm font-semibold text-accent-text hover:underline">Manage retainer →</Link>
              </div>
            </Card>
          ))}
          {home.firstTime && home.checklist ? <ChecklistCard checklist={home.checklist} /> : null}
          <Card>
            <CardHeader title="Recent activity" />
            <ActivityFeed items={home.activity} empty="Activity will appear here as your projects move forward." />
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold">File storage</span><span className="text-muted">{formatBytes(home.storage.usedBytes)} of {formatBytes(home.storage.limitBytes)}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, Math.min(100, (home.storage.usedBytes / home.storage.limitBytes) * 100))}%` }} /></div>
            <p className="mt-2 text-xs text-subtle">{home.storage.files} file{home.storage.files === 1 ? "" : "s"} across your projects</p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ChecklistCard({ checklist }: { checklist: NonNullable<Awaited<ReturnType<typeof clientHome>>["checklist"]> }) {
  const pct = Math.round((checklist.done / checklist.total) * 100);
  return (
    <Card>
      <CardHeader title="Getting started" description={`${checklist.done} of ${checklist.total} done`} />
      <div className="px-5 pb-5">
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <ul className="space-y-1.5">
          {checklist.items.map((i) => (
            <li key={i.key}>
              {i.done || !i.href ? (
                <div className="flex items-center gap-2.5 py-1 text-sm"><span className={i.done ? "text-success" : "text-subtle"}><Icon name={i.done ? "check-circle" : "clock"} size={16} /></span><span className={i.done ? "text-muted line-through decoration-line-strong" : ""}>{i.label}</span></div>
              ) : (
                <Link href={i.href} className="group flex items-center gap-2.5 rounded-lg py-1 text-sm hover:text-accent-text"><span className="text-subtle"><Icon name="clock" size={16} /></span><span className="flex-1 font-medium">{i.label}</span><Icon name="chevron-right" size={14} className="text-subtle group-hover:text-accent-text" /></Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
