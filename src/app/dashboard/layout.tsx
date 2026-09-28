import { AppShell } from "@/components/shell/app-shell";
import { CLIENT_NAV, filterNav } from "@/components/shell/nav-config";
import { requirePageActor } from "@/server/auth/actor";
import { getSiteContext } from "@/server/services/public";
import { unreadCount } from "@/server/services/notifications";

const BOTTOM = [
  { label: "Home", href: "/dashboard", icon: "dashboard", exact: true },
  { label: "Projects", href: "/dashboard/projects", icon: "film" },
  { label: "Messages", href: "/dashboard/messages", icon: "message" },
  { label: "Invoices", href: "/dashboard/invoices", icon: "receipt" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("client");
  const [site, unread] = await Promise.all([getSiteContext(), unreadCount(actor)]);
  return (
    <AppShell area="client" groups={filterNav(CLIENT_NAV, actor.permissions)} perms={actor.permissions} user={{ name: actor.name, email: actor.email }} business={site.business} unread={unread} bottomNav={BOTTOM}>
      {children}
    </AppShell>
  );
}
