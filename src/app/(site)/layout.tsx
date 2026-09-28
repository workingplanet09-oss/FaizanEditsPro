import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { AttributionTracker } from "@/components/site/attribution-tracker";
import { getSiteContext } from "@/server/services/public";
import { getActor } from "@/server/auth/actor";
import { homeForRoles } from "@/lib/permissions";
import { ErrorState } from "@/components/shell/error-state";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  let site;
  try {
    site = await getSiteContext();
  } catch {
    return (
      <main id="main">
        <ErrorState code="Setup" icon="settings" title="Almost there — the database isn't set up yet" description="Run `npm run db:deploy` and `npm run db:seed`, then reload this page. See the README for the full setup." actions={[{ label: "Reload", href: "/", primary: true }]} />
      </main>
    );
  }
  const actor = await getActor();
  return (
    <>
      <SiteHeader name={site.business.name} logoUrl={site.business.logoUrl || undefined} links={site.nav.links} loginLabel={site.nav.loginLabel} ctaLabel={site.nav.ctaLabel} signedIn={!!actor} portalHref={actor ? homeForRoles(actor.roleKeys, actor.permissions) : undefined} />
      <AttributionTracker />
      <main id="main">{children}</main>
      <SiteFooter site={site} />
    </>
  );
}
