import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { listMessages, listThreads } from "@/server/services/messages";
import { first, type SearchParams } from "@/server/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { MessageThread, type Msg } from "@/components/portal/message-thread";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Messages", path: "/admin/messages", noindex: true });

export default async function MessagesAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/messages");
  const sp = await searchParams;
  const threads = await listThreads(actor);
  const active = first(sp.thread);
  const current = threads.find((t) => t.key === active) ?? threads.find((t) => t.projectId === active) ?? threads[0];
  const items = current ? await listMessages(actor, current.projectId ? { projectId: current.projectId, markRead: true } : { clientId: current.clientId, markRead: true }) : [];
  return (
    <>
      <PageHeader title="Messages" description="Client conversations by project. Replies notify the client by email and in their portal." />
      {!threads.length ? (
        <Card><EmptyState icon="message" title="No conversations yet" description="When clients message you from their portal, threads appear here." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr]">
          <Card className="max-h-[38rem] overflow-y-auto">
            <ul className="divide-y divide-line" aria-label="Conversations">
              {threads.map((t) => {
                const on = current?.key === t.key;
                return (
                  <li key={t.key}>
                    <Link href={`/admin/messages?thread=${encodeURIComponent(t.key)}`} aria-current={on ? "page" : undefined} className={cn("flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface-2/60", on && "bg-surface-2")}>
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={t.projectId ? "film" : "help"} size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{t.title}</span><span className="shrink-0 text-[11px] text-subtle">{timeAgo(t.lastAt)}</span></span><span className="block truncate text-xs text-muted">{t.client}{t.code ? ` · ${t.code}` : ""}</span><span className="mt-0.5 block truncate text-xs text-subtle">{t.lastPreview}</span></span>
                      {t.unread ? <span className="mt-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">{t.unread}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          {current ? (
            <div>
              <h2 className="mb-3 flex flex-wrap items-baseline gap-2 text-base font-extrabold">{current.title}<span className="text-sm font-medium text-muted">{current.client}</span>{current.projectId ? <Link className="text-sm font-semibold text-accent hover:underline" href={`/admin/projects/${current.projectId}`}>Open project →</Link> : null}</h2>
              <MessageThread key={current.key} projectId={current.projectId} clientId={current.projectId ? undefined : current.clientId} initial={items as unknown as Msg[]} staff placeholder="Reply to the client…" />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
