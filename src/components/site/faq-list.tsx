import { renderMarkdown } from "@/lib/markdown";

/** Accessible accordion using native <details>: keyboard operable, works without JS, no layout shift. */
export function FaqList({ items }: { items: { id: string; question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
      {items.map((f) => (
        <details key={f.id} className="group px-5 py-1 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[15px] font-bold marker:hidden [&::-webkit-details-marker]:hidden">
            {f.question}
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg leading-none transition group-open:rotate-45 group-open:bg-accent group-open:text-accent-fg">
              +
            </span>
          </summary>
          <div className="prose-lite pb-5 pr-10 text-sm text-muted" dangerouslySetInnerHTML={{ __html: renderMarkdown(f.answer) }} />
        </details>
      ))}
    </div>
  );
}
