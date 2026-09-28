import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { cached, invalidate } from "../cache";
import { SETTING_DEFAULTS, type SettingKey, type Settings } from "@/lib/site-defaults";
import type { Actor } from "../auth/actor";
import { assertCan } from "../auth/actor";
import { audit } from "./audit";

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Objects merge recursively; arrays and scalars from storage replace the defaults. */
function merge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined || over === null ? base : (over as T)) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge((base as any)[k], v) : v;
  return out as T;
}

export async function getWorkspaceId(): Promise<string> {
  return cached("ws:id", 5 * 60_000, async () => {
    const slug = process.env.WORKSPACE_SLUG || "default";
    const ws = (await db.workspace.findUnique({ where: { slug } })) ?? (await db.workspace.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!ws) throw new Error("No workspace exists yet. Run `npm run db:seed` to bootstrap the database.");
    return ws.id;
  });
}

export async function getSetting<K extends SettingKey>(workspaceId: string, key: K): Promise<Settings[K]> {
  return cached(`setting:${workspaceId}:${key}`, 15_000, async () => {
    const row = await db.setting.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
    return merge(SETTING_DEFAULTS[key], row?.value) as Settings[K];
  });
}

export async function getSettings<K extends SettingKey>(workspaceId: string, keys: K[]): Promise<{ [P in K]: Settings[P] }> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(workspaceId, k)] as const));
  return Object.fromEntries(entries) as { [P in K]: Settings[P] };
}

export async function getAllSettings(workspaceId: string): Promise<Settings> {
  return (await getSettings(workspaceId, Object.keys(SETTING_DEFAULTS) as SettingKey[])) as Settings;
}

export async function saveSetting(actor: Actor, key: SettingKey, value: unknown) {
  assertCan(actor, "settings:manage");
  if (!(key in SETTING_DEFAULTS)) throw new Error(`Unknown setting ${key}`);
  const json = value as Prisma.InputJsonValue;
  await db.setting.upsert({
    where: { workspaceId_key: { workspaceId: actor.workspaceId, key } },
    create: { workspaceId: actor.workspaceId, key, value: json, updatedById: actor.userId },
    update: { value: json, updatedById: actor.userId },
  });
  invalidate("setting:");
  invalidate("public:");
  await audit(actor, { workspaceId: actor.workspaceId, action: "settings.update", entityType: "setting", entityId: key, message: `${actor.name} updated “${key}” settings` });
}

export function invalidateSettings() {
  invalidate("setting:");
  invalidate("public:");
}
