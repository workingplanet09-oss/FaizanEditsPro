import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { listAutomations } from "@/server/services/automations";
import { EVENT_LABELS, EVENT_NAMES } from "@/server/events/bus";
import { db } from "@/server/db";
import { guard } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { AutomationManager } from "@/components/admin/automation-manager";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Automations", path: "/admin/automations", noindex: true });

export default async function AutomationsPage() {
  const actor = await requirePageActor("admin", "/admin/automations");
  if (!can(actor, "automations:manage")) denyPage();
  const [rows, templates] = await guard(() => Promise.all([listAutomations(actor), db.emailTemplate.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { name: "asc" }, select: { key: true, name: true } })]));
  return (
    <>
      <PageHeader title="Automations" description="Reminders, notifications and follow-ups that run themselves. Every run is recorded." />
      <AutomationManager
        canManage
        events={EVENT_NAMES.map((e) => ({ value: e, label: EVENT_LABELS[e] }))}
        templates={templates}
        automations={rows.map((a) => ({ id: a.id, name: a.name, description: a.description, event: a.event, enabled: a.enabled, isSystem: a.isSystem, conditions: a.conditions, actions: a.actions.map((x) => ({ id: x.id, type: x.type, config: x.config as Record<string, any>, delayMinutes: x.delayMinutes })), runs: a._count.runs }))}
      />
    </>
  );
}
