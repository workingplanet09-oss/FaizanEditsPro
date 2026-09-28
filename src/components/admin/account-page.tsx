import { db } from "@/server/db";
import type { Actor } from "@/server/auth/actor";
import { listSessions } from "@/server/services/auth";
import { getPreferences } from "@/server/services/notifications";
import { first } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { NotificationPrefs, ProfileForm, SecurityPanel } from "@/components/account/account-panels";

/** "My account" for staff areas (profile, notifications, security). */
export async function AccountPage({ actor, base, sp }: { actor: Actor; base: string; sp: Record<string, string | string[] | undefined> }) {
  const tab = first(sp.tab) ?? "profile";
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { phone: true, timezone: true } });
  return (
    <>
      <PageHeader title="My account" description={`${actor.name} · ${actor.roleKeys.map((r) => r.replace(/_/g, " ")).join(", ")}`} />
      <TabNav basePath={`${base}/account`} active={tab} tabs={[{ key: "profile", label: "Profile" }, { key: "notifications", label: "Notifications" }, { key: "security", label: "Security" }]} />
      <div className="max-w-4xl">
        {tab === "profile" ? <ProfileForm name={actor.name} email={actor.email} phone={user.phone ?? ""} timezone={user.timezone ?? ""} /> : null}
        {tab === "notifications" ? <NotificationPrefs prefs={await getPreferences(actor)} /> : null}
        {tab === "security" ? <SecurityPanel twoFactorEnabled={actor.twoFactorEnabled} sessions={(await listSessions(actor)) as any} /> : null}
      </div>
    </>
  );
}
