import { AppShell } from "@/components/shell/app-shell";
import { EDITOR_NAV, filterNav } from "@/components/shell/nav-config";
import { requirePageActor } from "@/server/auth/actor";
import { getSiteContext } from "@/server/services/public";
import { unreadCount } from "@/server/services/notifications";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("editor");
  const [site, unread] = await Promise.all([getSiteContext(), unreadCount(actor)]);
  return (
    <AppShell area="editor" groups={filterNav(EDITOR_NAV, actor.permissions)} perms={actor.permissions} user={{ name: actor.name, email: actor.email }} business={site.business} unread={unread}>
      {children}
    </AppShell>
  );
}
