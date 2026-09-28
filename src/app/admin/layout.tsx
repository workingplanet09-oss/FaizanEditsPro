import { AppShell } from "@/components/shell/app-shell";
import { ADMIN_NAV, filterNav } from "@/components/shell/nav-config";
import { requirePageActor } from "@/server/auth/actor";
import { getSiteContext } from "@/server/services/public";
import { unreadCount } from "@/server/services/notifications";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("admin");
  const [site, unread] = await Promise.all([getSiteContext(), unreadCount(actor)]);
  return (
    <AppShell area="admin" groups={filterNav(ADMIN_NAV, actor.permissions)} perms={actor.permissions} user={{ name: actor.name, email: actor.email }} business={site.business} unread={unread}>
      {children}
    </AppShell>
  );
}
