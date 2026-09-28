import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { listRoles, listTeam } from "@/server/services/team";
import { guard } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { TeamManager } from "@/components/admin/team-manager";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Team", path: "/admin/team", noindex: true });

export default async function TeamPage() {
  const actor = await requirePageActor("admin", "/admin/team");
  if (!can(actor, "team:manage")) denyPage();
  const [members, roles] = await guard(() => Promise.all([listTeam(actor), listRoles(actor)]));
  return (
    <>
      <PageHeader title="Team & permissions" description="Invite editors and managers, set their roles and suspend access. Every change is logged." />
      <TeamManager members={members as any} roles={roles} meId={actor.userId} isSuper={actor.roleKeys.includes("super_admin")} />
    </>
  );
}
