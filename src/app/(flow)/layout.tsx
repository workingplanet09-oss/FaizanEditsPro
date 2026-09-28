import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { AttributionTracker } from "@/components/site/attribution-tracker";
import { getSiteContext } from "@/server/services/public";
import { ErrorState } from "@/components/shell/error-state";

/** Distraction-free frame for the wizard and auth screens: logo, a help link, nothing else. */
export default async function FlowLayout({ children }: { children: React.ReactNode }) {
  let site;
  try {
    site = await getSiteContext();
  } catch {
    return (
      <main id="main">
        <ErrorState code="Setup" icon="settings" title="Almost there — the database isn't set up yet" description="Run `npm run db:deploy` and `npm run db:seed`, then reload this page." actions={[{ label: "Reload", href: "/", primary: true }]} />
      </main>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">Skip to content</a>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo name={site.business.name} logoUrl={site.business.logoUrl || undefined} />
          <div className="flex items-center gap-5 text-sm font-semibold text-muted">
            <Link href="/help" className="hover:text-fg">Help</Link>
            <Link href="/contact" className="hidden hover:text-fg sm:inline">Talk to us</Link>
          </div>
        </div>
      </header>
      <AttributionTracker />
      <main id="main" className="flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-subtle">
        <Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/terms" className="hover:text-fg">Terms</Link> · © {new Date().getFullYear()} {site.business.name}
      </footer>
    </div>
  );
}
