import { authRoute, z } from "@/server/api";
import { updateProfile } from "@/server/services/auth";

export const PATCH = authRoute(
  { body: z.object({ name: z.string().trim().min(2).max(100).optional(), phone: z.string().max(40).nullish(), timezone: z.string().max(60).nullish(), avatarUrl: z.string().url().max(500).nullish() }) },
  async ({ actor, body }) => updateProfile(actor, body),
);
