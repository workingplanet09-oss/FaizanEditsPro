import { authRoute, AppError } from "@/server/api";
import { getSetting, saveSetting } from "@/server/services/settings";
import { assertCan } from "@/server/auth/actor";
import { SETTING_SCHEMAS } from "@/server/api/setting-schemas";
import type { SettingKey } from "@/lib/site-defaults";

function keyOf(k: string): SettingKey {
  if (!(k in SETTING_SCHEMAS)) throw new AppError("NOT_FOUND", "Unknown settings group.");
  return k as SettingKey;
}

export const GET = authRoute({}, async ({ actor, params }) => {
  assertCan(actor, "settings:manage");
  return getSetting(actor.workspaceId, keyOf(params.key));
});

export const PUT = authRoute({}, async ({ actor, params, req }) => {
  const key = keyOf(params.key);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  const value = await SETTING_SCHEMAS[key].parseAsync(raw);
  await saveSetting(actor, key, value);
  return value;
});
