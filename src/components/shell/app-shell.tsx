import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { CommandPalette, CommandTrigger } from "./command-palette";
import { OfflineBanner } from "./offline-banner";
import { BottomNav, MobileNav, NavList } from "./sidebar-nav";
import { Icon } from "@/components/ui/icon";
import { commandsFor, type NavGroup } from "./nav-config";

export interface ShellProps {
  area: "admin" | "editor" | "client";
  groups: NavGroup[];
  perms: Set<string>;
  user: { name: string; email: string };
  business: { name: string; logoUrl?: string | null };
  unread: number;
  badges?: Record<string, number>;
  bottomNav?: { label: string; href: string; icon: string; exact?: boolean }[];
  children: React.ReactNode;
}

const AREA_LABEL = { admin: "Admin console", editor: "Editor workspace", client: "Client portal" } as const;

/** Sidebar + top bar frame for every signed-in area. Pages render only their content. */
export function AppShell({ area, groups, perms, user, business, unread, badges, bottomNav, children }: ShellProps) {
  const home = { admin: "/admin", editor: "/editor", client: "/dashboard" }[area];
  const menu = [
    ...(area === "client" ? [{ label: "Settings", href: "/dashboard/settings", icon: "settings" }] : []),
    { label: "View website", href: "/", icon: "external" },
    { label: "Help center", href: "/help", icon: "help" },
  ];
  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">Skip to content</a>
      <OfflineBanner />
      {/* desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] flex-col border-r border-line bg-surface/60 lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <Logo name={business.name} logoUrl={business.logoUrl} href={home} className="[&>span:last-child]:max-w-[9.5rem] [&>span:last-child]:truncate" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5"><NavList groups={groups} badges={badges} /></div>
        <div className="border-t border-line p-3">
          <div className="rounded-xl bg-surface-2/70 px-3 py-2.5 text-xs">
            <div className="font-bold">{AREA_LABEL[area]}</div>
            <Link href="/" className="mt-0.5 inline-flex items-center gap-1 text-muted hover:text-fg">View website <Icon name="arrow-up-right" size={12} /></Link>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur sm:px-6">
          <MobileNav groups={groups} badges={badges} title={business.name} />
          <CommandTrigger className="w-full max-w-sm flex-1 sm:flex-none sm:w-72" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell initialUnread={unread} />
            <UserMenu name={user.name} email={user.email} links={menu} />
          </div>
        </header>
        <main id="main" className={`mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 ${bottomNav ? "pb-28 lg:pb-8" : ""}`}>{children}</main>
      </div>
      {bottomNav ? <BottomNav items={bottomNav} badges={badges} /> : null}
      <CommandPalette commands={commandsFor(area, groups, perms)} canSearch />
    </div>
  );
}
