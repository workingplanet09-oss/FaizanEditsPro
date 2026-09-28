import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";

export interface ErrorStateProps {
  code?: string;
  icon?: string;
  title: string;
  /** what happened */
  description: string;
  /** what the user can do next */
  actions?: { label: string; href: string; primary?: boolean }[];
  footer?: React.ReactNode;
  compact?: boolean;
}

/** Every error surface answers two questions: what happened, and what can I do next. */
export function ErrorState({ code, icon = "alert", title, description, actions = [{ label: "Back to home", href: "/", primary: true }], footer, compact }: ErrorStateProps) {
  return (
    <div className={compact ? "flex flex-col items-center px-6 py-16 text-center" : "flex min-h-[70dvh] flex-col items-center justify-center px-6 py-16 text-center"}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
        <Icon name={icon} size={28} />
      </div>
      {code ? <div className="eyebrow mb-2">{code}</div> : null}
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md text-muted">{description}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {actions.map((a) => (
          <ButtonLink key={a.href + a.label} href={a.href} variant={a.primary ? "primary" : "outline"}>
            {a.label}
          </ButtonLink>
        ))}
      </div>
      {footer ? <div className="mt-8 text-sm text-subtle">{footer}</div> : null}
      <p className="mt-10 text-xs text-subtle">
        Need a hand? <Link className="underline underline-offset-4" href="/contact">Contact us</Link>
      </p>
    </div>
  );
}
