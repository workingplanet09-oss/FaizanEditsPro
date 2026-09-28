import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";

export function Section({ children, className, id, tone = "default" }: { children: React.ReactNode; className?: string; id?: string; tone?: "default" | "alt" | "dark" }) {
  return (
    <section id={id} className={cn("relative py-20 sm:py-28", tone === "alt" && "bg-surface-2/50", tone === "dark" && "dark-zone", className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left", className }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <Reveal className={cn("mb-12 max-w-2xl sm:mb-16", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <div className="eyebrow mb-3 flex items-center gap-2 before:h-px before:w-6 before:bg-accent">{eyebrow}</div> : null}
      <h2 className="text-[clamp(1.9rem,4.4vw,3.2rem)] font-extrabold leading-[1.05] tracking-tight">{title}</h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{description}</p> : null}
    </Reveal>
  );
}

/** Interior page hero (non-home pages). */
export function PageHero({ eyebrow, title, description, children }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="dark-zone grain relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[110px]" />
      <div className="container-page relative py-20 sm:py-28">
        <Reveal className="max-w-3xl">
          {eyebrow ? <div className="eyebrow mb-4 flex items-center gap-2 before:h-px before:w-6 before:bg-accent">{eyebrow}</div> : null}
          <h1 className="display text-[clamp(2.4rem,6vw,4.6rem)]">{title}</h1>
          {description ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{description}</p> : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </Reveal>
      </div>
    </div>
  );
}
