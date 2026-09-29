"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDateTime, timeAgo } from "@/lib/format";
import { formatBytes } from "@/lib/format";

export interface Msg {
  id: string;
  body: string;
  createdAt: string | Date;
  mine: boolean;
  recipientGroup?: string;
  sender: { id: string; name: string; isStaff: boolean; avatarUrl?: string | null };
  attachments?: { assetId: string; name: string; mimeType: string; sizeBytes: number }[];
}

/** Project (or general) conversation. Polls lightly for new messages; optimistic-free so what you see is what the server stored. */
export function MessageThread({
  projectId,
  clientId,
  initial,
  staff = false,
  height = "h-[32rem]",
  placeholder = "Write a message…",
}: {
  projectId?: string | null;
  clientId?: string | null;
  initial: Msg[];
  staff?: boolean;
  height?: string;
  placeholder?: string;
}) {
  const [items, setItems] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [group, setGroup] = useState<"PROJECT_MANAGER" | "EDITOR" | "SUPPORT">("PROJECT_MANAGER");
  const box = useRef<HTMLDivElement>(null);
  const qs = projectId ? `projectId=${projectId}` : clientId ? `clientId=${clientId}` : "";

  const load = useCallback(async () => {
    try {
      const rows = await api<Msg[]>(`/api/messages?${qs}&markRead=1`);
      setItems((prev) => (rows.length === prev.length && rows.at(-1)?.id === prev.at(-1)?.id ? prev : rows));
    } catch {
      /* transient — keep what we have */
    }
  }, [qs]);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [items.length]);

  const send = useAction(async () => api<Msg>("/api/messages", { body: { projectId: projectId ?? undefined, clientId: clientId ?? undefined, body: text, ...(staff ? {} : { recipientGroup: group }) } }), {
    refresh: false,
    onSuccess: (m) => {
      setText("");
      setItems((p) => [...p, m]);
    },
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
      <div ref={box} className={cn("thin-scroll space-y-4 overflow-y-auto px-4 py-5 sm:px-6", height)} aria-live="polite" aria-label="Conversation">
        {!items.length ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2"><Icon name="message" size={22} /></span>
            <p className="font-semibold text-fg">No messages yet</p>
            <p className="mt-1 max-w-xs">Ask a question or share a note — your project team replies here and by email.</p>
          </div>
        ) : (
          items.map((m, i) => {
            const prev = items[i - 1];
            const grouped = prev && prev.sender.id === m.sender.id && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
            return (
              <div key={m.id} className={cn("flex gap-3", m.mine && "flex-row-reverse", grouped && "-mt-2.5")}>
                <div className="w-8 shrink-0">{grouped ? null : <Avatar name={m.sender.name} size={32} src={m.sender.avatarUrl} />}</div>
                <div className={cn("max-w-[85%] min-w-0", m.mine && "text-right")}>
                  {grouped ? null : (
                    <div className={cn("mb-1 flex items-baseline gap-2 text-xs", m.mine && "flex-row-reverse")}>
                      <span className="font-bold">{m.mine ? "You" : m.sender.name}</span>
                      {m.sender.isStaff && !m.mine ? <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Studio</span> : null}
                      <time suppressHydrationWarning className="text-subtle" dateTime={new Date(m.createdAt).toISOString()} title={formatDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</time>
                    </div>
                  )}
                  <div className={cn("inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed", m.mine ? "rounded-tr-md bg-fg text-bg" : "rounded-tl-md bg-surface-2")}>{m.body}</div>
                  {m.attachments?.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {m.attachments.map((a) => (
                        <li key={a.assetId} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs"><Icon name="file" size={13} />{a.name}<span className="text-subtle">{formatBytes(a.sizeBytes)}</span></li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send.run();
        }}
        className="border-t border-line bg-surface-2/40 p-3 sm:p-4"
      >
        {send.error ? <p role="alert" className="mb-2 text-xs font-medium text-danger">{send.error}</p> : null}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="msg-body">Message</label>
          <textarea
            id="msg-body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) {
                e.preventDefault();
                void send.run();
              }
            }}
            rows={2}
            maxLength={5000}
            placeholder={placeholder}
            className="max-h-40 min-h-[3rem] flex-1 resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
          />
          <Button type="submit" icon="send" loading={send.pending} disabled={!text.trim()} aria-label="Send message">
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-subtle">
          <span>Ctrl/⌘ + Enter to send</span>
          {!staff ? (
            <label className="flex items-center gap-1.5">
              Send to
              <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs font-medium text-fg">
                <option value="PROJECT_MANAGER">Project manager</option>
                <option value="EDITOR">Editor</option>
                <option value="SUPPORT">Support</option>
              </select>
            </label>
          ) : null}
        </div>
      </form>
    </div>
  );
}
