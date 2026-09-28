"use client";

import { api } from "@/lib/api-client";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Answers, FormDef } from "@/lib/conditions";
import { FormWizard } from "./form-wizard";

/** The post-payment project brief. Same engine as the public wizard, but authenticated and autosaved against the project. */
export function ProjectSetup({ projectId, projectName, form, answers, step, extraCategories, firstTime, previousProjects }: { projectId: string; projectName: string; form: FormDef; answers: Answers; step: number; extraCategories: string[]; firstTime: boolean; previousProjects: { id: string; name: string }[] }) {
  return (
    <FormWizard<{ briefVersion: number }>
      form={form}
      mode="project"
      initialAnswers={answers}
      initialStep={step}
      extraCategories={extraCategories}
      exitHref={`/dashboard/projects/${projectId}`}
      uploads={{ purpose: "asset", projectId, folderKey: "references" }}
      firstTime={firstTime}
      submitLabel="Submit project brief"
      previousProjects={previousProjects}
      onUsePrevious={async (id) => (await api<{ answers: Answers }>(`/api/leads/previous?projectId=${encodeURIComponent(id)}`)).answers}
      saveDraft={async (_token, a, s) => {
        await api(`/api/projects/${projectId}/onboarding`, { method: "PUT", body: { answers: a, step: s } });
      }}
      submit={async (a) => api(`/api/projects/${projectId}/onboarding`, { body: { answers: a } })}
      renderDone={() => (
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" size={30} /></span>
          <h1 className="mt-6 text-[clamp(1.8rem,4vw,2.4rem)] font-extrabold tracking-tight">Your brief is in</h1>
          <p className="mt-3 text-muted">Thanks — we've turned your answers into a project brief for <b className="text-fg">{projectName}</b>. Next, upload your footage and assets so your editor can begin.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={`/dashboard/projects/${projectId}?tab=files`} icon="upload" size="lg">Upload files</ButtonLink>
            <ButtonLink href={`/dashboard/projects/${projectId}`} variant="outline" size="lg">Back to project</ButtonLink>
          </div>
        </div>
      )}
    />
  );
}
