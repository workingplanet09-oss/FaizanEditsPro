import { cn } from "@/lib/cn";

/** Centered card used by every sign-in / account screen. */
export function AuthCard({ title, description, children, footer, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-md", className)}>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft sm:p-9">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p> : null}
        <div className="mt-7">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "danger"; children: React.ReactNode }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cn("mb-5 rounded-xl px-4 py-3 text-sm font-medium", tone === "success" && "bg-success-soft text-success", tone === "danger" && "bg-danger-soft text-danger", tone === "info" && "bg-info-soft text-info")}>
      {children}
    </p>
  );
}

/** Only same-site relative paths are honoured for post-login redirects (no open redirects). */
export function safeNext(next: string | undefined | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
