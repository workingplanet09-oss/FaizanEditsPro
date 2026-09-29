import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { getAllSettings } from "@/server/services/settings";
import { integrationStatus, env } from "@/server/env";
import { jobStats } from "@/server/services/admin";
import { first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { IntegrationCard, SettingsEditor } from "@/components/admin/settings-editor";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Settings", path: "/admin/settings", noindex: true });

const GROUPS: { key: string; label: string; icon: string; description: string }[] = [
  { key: "business", label: "Business", icon: "building", description: "Studio name, contact details, currencies, revision policy." },
  { key: "theme", label: "Brand colour", icon: "palette", description: "The single accent colour used across the site and apps." },
  { key: "hero", label: "Homepage hero", icon: "sparkles", description: "Headline, sub-headline, buttons and trust points." },
  { key: "stats", label: "Homepage stats", icon: "chart", description: "Real (auto) or hand-typed figures. Empty ones are hidden." },
  { key: "nav", label: "Navigation", icon: "menu", description: "Header links and buttons." },
  { key: "footer", label: "Footer", icon: "panel", description: "Footer columns, description and newsletter." },
  { key: "process", label: "Process page", icon: "workflow", description: "The 7-step process shown on the website." },
  { key: "about", label: "About page", icon: "users", description: "Story, values and team." },
  { key: "contactInfo", label: "Contact page", icon: "mail", description: "Heading, intro and promised response time." },
  { key: "legal", label: "Legal", icon: "file", description: "Terms of service and privacy policy text." },
  { key: "quote", label: "Quotes", icon: "clipboard", description: "Prefix, validity, default deposit, terms." },
  { key: "invoice", label: "Invoices", icon: "receipt", description: "Prefix, due days, notes, payment instructions." },
  { key: "workflow", label: "Workflow rules", icon: "settings", description: "Payment-before-delivery, internal review, automations." },
  { key: "booking", label: "Booking", icon: "calendar", description: "Availability, slot length, call types." },
  { key: "seo", label: "SEO", icon: "globe", description: "Title template, default description, social image." },
  { key: "notifications", label: "Notifications", icon: "bell", description: "Where admin alerts are emailed." },
];

export default async function SettingsAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/settings");
  if (!can(actor, "settings:manage")) denyPage();
  const sp = await searchParams;
  const key = first(sp.g) ?? "integrations";
  const [all, jobs] = await Promise.all([getAllSettings(actor.workspaceId), jobStats(actor)]);
  const st = integrationStatus();
  const group = GROUPS.find((g) => g.key === key);
  return (
    <>
      <PageHeader title="Settings" description="Everything about your studio, site and workflow. Changes go live immediately." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Settings sections" className="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
          {[{ key: "integrations", label: "Integrations & system", icon: "zap", description: "" }, ...GROUPS].map((g) => (
            <Link key={g.key} href={`/admin/settings?g=${g.key}`} aria-current={g.key === key ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition", g.key === key ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              <Icon name={g.icon} size={16} className={g.key === key ? "text-accent" : "text-subtle"} />{g.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {group ? (
            <>
              <h2 className="text-xl font-extrabold">{group.label}</h2>
              <p className="mb-5 mt-1 text-sm text-muted">{group.description}</p>
              <SettingsEditor key={group.key} group={group.key} value={(all as any)[group.key]} />
            </>
          ) : (
            <div className="space-y-6">
              <IntegrationCard
                items={[
                  { name: "Database", ok: true, detail: "PostgreSQL connected.", env: "DATABASE_URL" },
                  { name: "File storage", ok: st.storage.configured, detail: st.storage.provider === "local" ? "Local disk with signed URLs — fine for demos; use S3 / R2 in production." : `S3-compatible bucket (${env.storage.bucket || "not set"}).`, env: "STORAGE_PROVIDER" },
                  { name: "Payments", ok: st.payments.configured, detail: st.payments.provider === "demo" ? "Demo checkout — no card is charged. Set PAYMENT_PROVIDER=stripe for live payments." : `Provider: ${st.payments.provider}.`, env: "PAYMENT_PROVIDER" },
                  { name: "Email", ok: st.email.configured, detail: st.email.provider === "console" ? "Emails are written to the outbox instead of being delivered." : `Provider: ${st.email.provider}.`, env: "EMAIL_PROVIDER" },
                  { name: "Google sign-in", ok: st.google.configured, detail: st.google.configured ? "Enabled on the login page." : "Optional — add client ID and secret to enable.", env: "GOOGLE_CLIENT_ID" },
                  { name: "Spam protection (Turnstile)", ok: st.turnstile.configured, detail: st.turnstile.configured ? "Cloudflare Turnstile is checking public forms." : "Honeypot, time-trap and rate limits are active; add Turnstile for stronger protection.", env: "TURNSTILE_SECRET" },
                  { name: "Malware scanning", ok: st.scan.configured, detail: st.scan.provider === "none" ? "Not enabled. Uploads are type- and size-checked; connect a scanner for production." : `Provider: ${st.scan.provider}.`, env: "SCAN_PROVIDER" },
                  { name: "Demo mode", ok: !st.demoMode, detail: st.demoMode ? "ON — demo login buttons and demo checkout are enabled. Turn off before launch." : "Off.", env: "DEMO_MODE" },
                ]}
              />
              <Card>
                <CardHeader title="Background jobs" description="Emails, reminders and automations run through a Postgres-backed queue." />
                <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
                  {Object.entries(jobs.counts).map(([k, n]) => <Badge key={k} tone={k === "FAILED" ? "danger" : k === "PENDING" ? "warning" : "neutral"}>{k.toLowerCase()}: {n as number}</Badge>)}
                  {jobs.counts.FAILED ? <ActionButton url="/api/admin/jobs" size="sm" variant="outline" success="Failed jobs queued for retry">Retry failed jobs</ActionButton> : null}
                  {!Object.keys(jobs.counts).length ? <span className="text-sm text-muted">No jobs yet.</span> : null}
                </div>
                {jobs.failed.length ? <ul className="divide-y divide-line border-t border-line">{jobs.failed.map((j) => <li key={j.id} className="px-5 py-3 text-sm"><b>{j.type}</b> <span className="text-muted">— {j.lastError?.slice(0, 160)}</span></li>)}</ul> : null}
              </Card>
              <Card className="p-5 text-sm text-muted">Need to remove the sample data? Run <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run db:clear-demo</code>. Sample rows are labelled <b>Sample</b> in the content lists.</Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
