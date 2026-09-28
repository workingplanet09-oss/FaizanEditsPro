import { StartProject } from "@/components/wizard/start-project";
import { ErrorState } from "@/components/shell/error-state";
import { getFormDef } from "@/server/services/onboarding";
import { getWorkspaceId } from "@/server/services/settings";
import { getActor } from "@/server/auth/actor";
import { inquiryPrefill } from "@/server/services/leads";
import { homeForRoles } from "@/lib/permissions";
import { SERVICE_TO_LOOKING_FOR } from "@/lib/site-defaults";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Start a project", description: "Tell us about your video — it takes a few minutes and every answer is saved as you go.", path: "/start-project", noindex: true });

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StartProjectPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const form = await getFormDef(await getWorkspaceId(), "inquiry");
  if (!form) {
    return <ErrorState code="Setup" icon="settings" title="The project form isn't set up yet" description="Run `npm run db:seed` to create the default questions, or build your own under Admin → Forms." actions={[{ label: "Contact us instead", href: "/contact", primary: true }]} />;
  }
  const actor = await getActor();
  const prefill = await inquiryPrefill(actor);
  const service = one(sp.service);
  const lookingFor = one(sp.looking_for) ?? (service ? SERVICE_TO_LOOKING_FOR[service] : undefined);
  const initialAnswers = { ...prefill.answers, ...(lookingFor ? { looking_for: lookingFor } : {}) };
  return (
    <StartProject
      form={form}
      initialAnswers={initialAnswers}
      serviceSlug={service}
      plan={one(sp.plan)}
      signedIn={!!actor}
      skipContact={prefill.skipContact}
      previousProjects={prefill.previousProjects}
      portalHref={actor ? homeForRoles(actor.roleKeys, actor.permissions) : "/"}
    />
  );
}
