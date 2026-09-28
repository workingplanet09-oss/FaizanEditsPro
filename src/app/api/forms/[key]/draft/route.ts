import { publicRoute, z, AppError } from "@/server/api";
import { getDraft, saveDraft } from "@/server/services/onboarding";
import { getWorkspaceId } from "@/server/services/settings";
import { rateLimit } from "@/server/security/ratelimit";

const OPEN_FORMS = new Set(["inquiry"]);

/** Debounced autosave target for the wizard. Anonymous visitors resume via an unguessable token kept in localStorage. */
export const PUT = publicRoute(
  { body: z.object({ token: z.string().max(80).nullish(), data: z.record(z.string(), z.any()), step: z.number().int().min(0).max(50) }) },
  async ({ params, body, actor, ip }) => {
    if (!OPEN_FORMS.has(params.key)) throw new AppError("FORBIDDEN", "Not available.");
    rateLimit(`draft:${ip}`, 240, 10 * 60_000);
    if (JSON.stringify(body.data).length > 200_000) throw new AppError("BAD_REQUEST", "That draft is too large.");
    return saveDraft({ workspaceId: await getWorkspaceId(), token: body.token, userId: actor?.userId, formKey: params.key, data: body.data, step: body.step });
  },
);

export const GET = publicRoute({ query: z.object({ token: z.string().max(80).optional() }) }, async ({ params, query, actor }) => {
  if (!OPEN_FORMS.has(params.key)) throw new AppError("FORBIDDEN", "Not available.");
  return { draft: await getDraft({ token: query.token, userId: actor?.userId, formKey: params.key }) };
});
