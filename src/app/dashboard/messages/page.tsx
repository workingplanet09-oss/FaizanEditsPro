import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { listMessages, listThreads } from "@/server/services/messages";
import { listClientProjects } from "@/server/services/projects";
import { first, type SearchParams } from "@/server/page";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import { MessageThread, type Msg } from "@/components/portal/message-thread";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Messages", path: "/dashboard/messages", noindex: true });

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/messages");
  const sp = await searchParams;
  const active = first(sp.thread) ?? "general";
  const [threads, projects] = await Promise.all([listThreads(actor), listClientProjects(actor, { includeClosed: true })]);
  const byKey = new Map(threads.map((t) => [t.projectId ?? "general", t]));
  const rows = [
    { id: "general", title: "General & support", sub: byKey.get("general")?.lastPreview ?? "Ask anything about billing, scope or your account", unread: byKey.get("general")?.unread ?? 0, at: byKey.get("general")?.lastAt },
    ...projects.map((p) => ({ id: p.id, title: p.name, sub: byKey.get(p.id)?.lastPreview ?? p.code, unread: byKey.get(p.id)?.unread ?? 0, at: byKey.get(p.id)?.lastAt })),
  ];
  const items = await listMessages(actor, { projectId: active === "general" ? null : active, markRead: true }).catch(() => []);
  const current = rows.find((r) => r.id === active) ?? rows[0];
  return (
    <>
      <PageHeader title="Messages" description="One conversation per project, plus a general thread. Replies also reach you by email." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_1fr]">
        <Card className="max-h-[36rem] overflow-y-auto">
          <ul className="divide-y divide-line" aria-label="Conversations">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/messages?thread=${r.id}`} aria-current={current.id === r.id ? "page" : undefined} className={cn("flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface-2/60", current.id === r.id && "bg-surface-2")}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={r.id === "general" ? "help" : "film"} size={16} /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{r.title}</span>{r.at ? <span className="shrink-0 text-[11px] text-subtle">{timeAgo(r.at)}</span> : null}</span><span className="mt-0.5 block truncate text-xs text-muted">{r.sub}</span></span>
                  {r.unread ? <span className="mt-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">{r.unread}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold">{current.title}</h2>
          <MessageThread key={current.id} projectId={current.id === "general" ? null : current.id} initial={items as unknown as Msg[]} placeholder={current.id === "general" ? "Ask us anything…" : "Message your project team…"} />
        </div>
      </div>
      {!projects.length && !threads.length ? <Card className="mt-5"><EmptyState icon="message" title="Say hello" description="Your project team will be here once a project starts. Until then, use the general thread for any question." /></Card> : null}
    </>
  );
}
