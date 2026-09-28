import type { NotificationCategory } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { queueEmail, absoluteUrl } from "../email";
import { AppError } from "../errors";
import { pageArgs, paged } from "./common";

export interface NotifyInput {
  workspaceId: string;
  userIds: string[];
  category: NotificationCategory;
  type: string;
  title: string;
  message?: string;
  /** app-relative link, e.g. /dashboard/projects/abc */
  link?: string;
  inApp?: boolean;
  email?: boolean;
  emailTemplate?: string;
  emailVars?: Record<string, string | number | null | undefined>;
  /** skip these user ids (usually the actor) */
  exclude?: string[];
}

/**
 * Creates in-app notifications and/or queues emails per recipient, honouring each user's
 * notification preferences for the category.
 */
export async function notify(input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.userIds)].filter((id) => !(input.exclude ?? []).includes(id));
  if (ids.length === 0) return 0;
  const [users, prefs] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids }, status: { not: "SUSPENDED" } }, select: { id: true, email: true, name: true, isDemo: true } }),
    db.notificationPreference.findMany({ where: { userId: { in: ids }, category: input.category } }),
  ]);
  const prefBy = new Map(prefs.map((p) => [p.userId, p]));
  const wantInApp = input.inApp ?? true;
  const wantEmail = input.email ?? false;

  let count = 0;
  for (const u of users) {
    const p = prefBy.get(u.id);
    if (wantInApp && (p?.inApp ?? true)) {
      await db.notification.create({
        data: {
          workspaceId: input.workspaceId,
          userId: u.id,
          category: input.category,
          type: input.type,
          title: input.title,
          message: input.message,
          link: input.link,
          isDemo: u.isDemo,
        },
      });
      count++;
    }
    if (wantEmail && (p?.email ?? true)) {
      await queueEmail({
        workspaceId: input.workspaceId,
        toEmail: u.email,
        toUserId: u.id,
        templateKey: input.emailTemplate ?? "notification",
        vars: {
          user_name: u.name,
          client_name: u.name,
          title: input.title,
          message: input.message ?? "",
          action_url: input.link ? absoluteUrl(input.link) : "",
          ...(input.emailVars ?? {}),
        },
        subject: input.title,
        body: `${input.message ?? input.title}\n\n[[Open in portal|${input.link ? absoluteUrl(input.link) : absoluteUrl("/dashboard")}]]`,
      });
      count++;
    }
  }
  return count;
}

export async function listNotifications(a: Actor, opts: { category?: NotificationCategory; unreadOnly?: boolean; page?: number; pageSize?: number } = {}) {
  const { page, pageSize, skip, take } = pageArgs(opts, 20, 50);
  const where = { userId: a.userId, ...(opts.category ? { category: opts.category } : {}), ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: a.userId, readAt: null } }),
  ]);
  return { ...paged(items, total, page, pageSize), unread };
}

export const unreadCount = (a: Actor) => db.notification.count({ where: { userId: a.userId, readAt: null } });

export async function markRead(a: Actor, id: string) {
  const r = await db.notification.updateMany({ where: { id, userId: a.userId, readAt: null }, data: { readAt: new Date() } });
  return { updated: r.count };
}

export async function markAllRead(a: Actor, category?: NotificationCategory) {
  const r = await db.notification.updateMany({ where: { userId: a.userId, readAt: null, ...(category ? { category } : {}) }, data: { readAt: new Date() } });
  return { updated: r.count };
}

const CATEGORIES: NotificationCategory[] = ["PROJECT", "MESSAGE", "PAYMENT", "REVIEW", "SYSTEM"];

export async function getPreferences(a: Actor) {
  const rows = await db.notificationPreference.findMany({ where: { userId: a.userId } });
  const by = new Map(rows.map((r) => [r.category, r]));
  return CATEGORIES.map((c) => ({ category: c, inApp: by.get(c)?.inApp ?? true, email: by.get(c)?.email ?? true }));
}

export async function setPreferences(a: Actor, prefs: { category: string; inApp: boolean; email: boolean }[]) {
  for (const p of prefs) {
    if (!CATEGORIES.includes(p.category as NotificationCategory)) throw new AppError("BAD_REQUEST", `Unknown category ${p.category}`);
    await db.notificationPreference.upsert({
      where: { userId_category: { userId: a.userId, category: p.category as NotificationCategory } },
      create: { userId: a.userId, category: p.category as NotificationCategory, inApp: p.inApp, email: p.email },
      update: { inApp: p.inApp, email: p.email },
    });
  }
  return getPreferences(a);
}
