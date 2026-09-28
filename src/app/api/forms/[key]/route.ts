import { publicRoute, AppError } from "@/server/api";
import { getFormDef } from "@/server/services/onboarding";
import { getWorkspaceId } from "@/server/services/settings";

/** Public definition of the inquiry form (questions, options, conditional logic) — served from the database. */
export const GET = publicRoute({}, async ({ params, actor }) => {
  const key = params.key;
  if (key !== "inquiry" && !actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  const form = await getFormDef(await getWorkspaceId(), key);
  if (!form) throw new AppError("NOT_FOUND", "Form not found.");
  return form;
});
