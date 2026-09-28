import { db } from "../db";
import { env } from "../env";
import { AppError, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { primaryClientFor } from "./clients";
import { getSetting } from "./settings";

export async function getMyReferrals(actor: Actor) {
  const wf = await getSetting(actor.workspaceId, "workflow");
  if (!wf.referralsEnabled) return { enabled: false as const };
  const client = await primaryClientFor(actor);
  if (!client) throw new AppError("NOT_FOUND", "No company linked.");
  const rows = await db.referral.findMany({ where: { referrerClientId: client.id }, orderBy: { createdAt: "desc" } });
  return {
    enabled: true as const,
    code: client.referralCode,
    link: `${env.appUrl}/start-project?ref=${client.referralCode}`,
    reward: wf.referralReward,
    referrals: rows.map((r) => ({ id: r.id, status: r.status, reward: r.reward, createdAt: r.createdAt })),
  };
}

export async function listReferrals(actor: Actor) {
  assertCan(actor, "clients:read");
  const rows = await db.referral.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 });
  const clientIds = [...new Set(rows.flatMap((r) => [r.referrerClientId, r.referredClientId].filter((x): x is string => !!x)))];
  const clients = await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, companyName: true } });
  const nm = new Map(clients.map((c) => [c.id, c.companyName]));
  return rows.map((r) => ({ ...r, referrer: nm.get(r.referrerClientId) ?? "—", referred: r.referredClientId ? nm.get(r.referredClientId) ?? "—" : null }));
}

export async function updateReferral(actor: Actor, id: string, patch: { status?: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED"; reward?: string }) {
  assertCan(actor, "clients:write");
  const r = await db.referral.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!r) throw notFound("Referral");
  return db.referral.update({ where: { id }, data: patch });
}
