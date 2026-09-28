import { authRoute, z } from "@/server/api";
import { updateClientProfile } from "@/server/services/clients";

export const PATCH = authRoute(
  { body: z.object({ brandSummary: z.string().max(2000).nullish(), editingPreferences: z.string().max(2000).nullish(), preferredContact: z.string().max(60).nullish(), communicationPrefs: z.record(z.string(), z.any()).optional() }) },
  async ({ actor, params, body }) => updateClientProfile(actor, params.id, body as any),
);
