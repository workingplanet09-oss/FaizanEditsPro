"use client";

import Link from "next/link";
import { api } from "@/lib/api-client";
import { captureAttribution } from "@/lib/attribution";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Answers, FormDef } from "@/lib/conditions";
import { FormWizard } from "./form-wizard";

interface Result {
  requestCode: string;
  projectType: string;
  responseTime: string;
  nextStep: string;
}

/** Public "Start a Project" wizard: autosaves to the server, resumes from a token, submits to /api/leads. */
export function StartProject({
  form,
  initialAnswers,
  serviceSlug,
  plan,
  signedIn,
  skipContact,
  previousProjects,
  portalHref,
}: {
  form: FormDef;
  initialAnswers: Answers;
  serviceSlug?: string;
  plan?: string;
  signedIn: boolean;
  skipContact: boolean;
  previousProjects: { id: string; name: string }[];
  portalHref: string;
}) {
  return (
    <FormWizard<Result>
      form={form}
      mode="inquiry"
      initialAnswers={initialAnswers}
      skipSections={skipContact ? ["contact"] : []}
      storageKey="fe-inquiry-draft"
      exitHref={signedIn ? portalHref : "/"}
      uploads={{ purpose: "lead_reference" }}
      previousProjects={previousProjects}
      onUsePrevious={async (projectId) => (await api<{ answers: Answers }>(`/api/leads/previous?projectId=${encodeURIComponent(projectId)}`)).answers}
      restoreDraft={async (token) => {
        try {
          const r = await api<{ draft: { data: Answers; step: number } | null }>(`/api/forms/inquiry/draft?token=${encodeURIComponent(token)}`);
          return r.draft;
        } catch {
          return null;
        }
      }}
      saveDraft={async (token, answers, step) => {
        await api("/api/forms/inquiry/draft", { method: "PUT", body: { token, data: answers, step } });
      }}
      submit={async (answers, ctx) => {
        const a = captureAttribution();
        const urlRef = new URLSearchParams(window.location.search).get("ref") ?? "";
        return api<Result>("/api/leads", {
          body: {
            answers: plan ? { ...answers, selected_plan: plan } : answers,
            serviceSlug: serviceSlug ?? null,
            draftToken: ctx.token,
            utm: a.utm,
            referrer: a.referrer || null,
            referralCode: (urlRef || a.ref || "").slice(0, 24) || null,
            hp: ctx.hp,
            t: ctx.startedAt,
          },
        });
      }}
      renderDone={(r) => (
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" size={30} /></span>
          <h1 className="mt-6 text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-tight">Request received</h1>
          <p className="mt-3 text-muted">Thanks — your project brief is with the studio. Expect to hear from us — <b className="text-fg">{r.responseTime || "soon"}</b>.</p>
          <dl className="mx-auto mt-8 grid max-w-md gap-px overflow-hidden rounded-2xl border border-line bg-line text-left">
            {[["Request ID", r.requestCode], ["Project type", r.projectType], ["Expected reply", r.responseTime || "Soon"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 bg-surface px-5 py-3.5">
                <dt className="text-xs font-semibold uppercase tracking-wider text-subtle">{k}</dt>
                <dd className="text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mx-auto mt-6 max-w-md rounded-2xl bg-surface-2 p-4 text-sm text-muted"><b className="text-fg">What happens next:</b> {r.nextStep} A confirmation email with your request ID is on its way.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={signedIn ? portalHref : "/"} variant="dark">{signedIn ? "Go to my dashboard" : "Back to home"}</ButtonLink>
            <ButtonLink href="/work" variant="outline">See recent work</ButtonLink>
          </div>
          <p className="mt-6 text-xs text-subtle">Need to add something? Reply to the confirmation email, or <Link className="underline" href="/contact">contact us</Link> quoting {r.requestCode}.</p>
        </div>
      )}
    />
  );
}
