import { requirePageActor } from "@/server/auth/actor";
import { first, type SearchParams } from "@/server/page";
import { db } from "@/server/db";
import { listSessions } from "@/server/services/auth";
import { listMembers, primaryClientFor } from "@/server/services/clients";
import { getPreferences } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/ui/tabs";
import { NotificationPrefs, ProfileForm, SecurityPanel } from "@/components/account/account-panels";
import { CompanyForm, MembersManager } from "@/components/portal/company-panels";
import { orgRoleCan } from "@/lib/permissions";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Settings", path: "/dashboard/settings", noindex: true });

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/settings");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "profile";
  const client = await primaryClientFor(actor);
  const role = actor.orgs.find((o) => o.organizationId === client?.organizationId)?.role ?? "MEMBER";
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { phone: true, timezone: true } });
  return (
    <>
      <PageHeader title="Settings" description="Your profile, company, team and security." />
      <TabNav basePath="/dashboard/settings" active={tab} tabs={[{ key: "profile", label: "Profile" }, { key: "company", label: "Company" }, { key: "team", label: "Team" }, { key: "notifications", label: "Notifications" }, { key: "security", label: "Security" }]} />
      <div className="max-w-4xl">
        {tab === "profile" ? <ProfileForm name={actor.name} email={actor.email} phone={user.phone ?? ""} timezone={user.timezone ?? ""} /> : null}
        {tab === "company" && client ? (
          <CompanyForm
            clientId={client.id}
            canEdit={orgRoleCan(role, "manage_projects")}
            initial={{ companyName: client.companyName ?? "", industry: client.industry ?? "", website: client.website ?? "", country: client.country ?? "", phone: client.phone ?? "", billingEmail: client.organization.billingEmail ?? "", billingAddress: client.organization.billingAddress ?? "", taxId: client.organization.taxId ?? "" }}
          />
        ) : null}
        {tab === "team" && client ? <MembersManager organizationId={client.organizationId} members={(await listMembers(actor, client.organizationId)) as any} canManage={orgRoleCan(role, "manage_members")} meId={actor.userId} /> : null}
        {tab === "notifications" ? <NotificationPrefs prefs={await getPreferences(actor)} /> : null}
        {tab === "security" ? <SecurityPanel twoFactorEnabled={actor.twoFactorEnabled} sessions={(await listSessions(actor)) as any} /> : null}
      </div>
    </>
  );
}
