import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";
import type { SiteContext } from "@/server/services/public";

const SOCIAL_ICON: Record<string, string> = { instagram: "camera", youtube: "play", linkedin: "briefcase", tiktok: "music", x: "message", behance: "palette" };

export function SiteFooter({ site }: { site: SiteContext }) {
  const { business, footer } = site;
  const socials = Object.entries(business.socials ?? {}).filter(([, v]) => v);
  return (
    <footer className="dark-zone relative border-t border-line">
      <div className="container-page grid grid-cols-1 gap-12 py-16 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo name={business.name} logoUrl={business.logoUrl} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{footer.description}</p>
          {business.email ? (
            <a href={`mailto:${business.email}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:text-accent-text">
              <Icon name="mail" size={16} />
              {business.email}
            </a>
          ) : null}
          {socials.length ? (
            <div className="mt-5 flex gap-2">
              {socials.map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noopener noreferrer" aria-label={k} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition hover:border-accent hover:text-accent-text">
                  <Icon name={SOCIAL_ICON[k] ?? "globe"} size={16} />
                </a>
              ))}
            </div>
          ) : null}
          {footer.newsletter ? (
            <div className="mt-8 max-w-sm">
              <div className="text-sm font-bold">Editing tips, occasionally</div>
              <p className="mt-1 text-xs text-muted">No spam. Unsubscribe anytime.</p>
              <NewsletterForm />
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footer.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="eyebrow mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-muted transition hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-subtle sm:flex-row">
          <span>
            © {new Date().getFullYear()} {business.legalName || business.name}. All rights reserved.
          </span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-fg">
              Contact
            </Link>
          </div>
        </div>
        {site.demoMode ? (
          <div className="border-t border-line bg-warning-soft py-2 text-center text-xs font-semibold text-warning">Demo mode: sample content and fictional data are enabled. Turn off DEMO_MODE and run “npm run db:clear-demo” before going live.</div>
        ) : null}
      </div>
    </footer>
  );
}
