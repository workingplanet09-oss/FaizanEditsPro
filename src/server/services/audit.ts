import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import type { Actor } from "../auth/actor";
import { getRequestMeta } from "../request-context";

type Who = Actor | { system: true; label?: string } | null;

const whoId = (w: Who) => (w && "userId" in w ? w.userId : null);
const whoLabel = (w: Who) => (w && "userId" in w ? w.name : w && "system" in w ? w.label ?? "System" : "Anonymous");
export const whoName = whoLabel;

/**
 * Immutable audit trail: who did what to which entity, when, from where.
 * e.g. "Faizan changed project status from Client Review to Revision"
 */
export async function audit(
  who: Who,
  input: { workspaceId: string; action: string; entityType: string; entityId?: string | null; message?: string; metadata?: Prisma.InputJsonValue },
  tx: Tx | typeof db = db,
) {
  const meta = getRequestMeta();
  await tx.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: whoId(who),
      actorLabel: whoLabel(who),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      message: input.message,
      metadata: input.metadata,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

export type Visibility = "CLIENT" | "INTERNAL";

/** Timeline entry shown on project / client / lead pages. CLIENT-visible entries appear in the portal. */
export async function logActivity(
  who: Who,
  input: {
    workspaceId: string;
    type: string;
    message: string;
    visibility?: Visibility;
    projectId?: string | null;
    clientId?: string | null;
    leadId?: string | null;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    isDemo?: boolean;
  },
  tx: Tx | typeof db = db,
) {
  await tx.activityLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: whoId(who),
      type: input.type,
      message: input.message,
      visibility: input.visibility ?? "INTERNAL",
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      isDemo: input.isDemo ?? false,
    },
  });
}
