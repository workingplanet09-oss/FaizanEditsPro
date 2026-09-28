import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getProjectOnboarding } from "@/server/services/briefs";
import { inquiryPrefill } from "@/server/services/leads";
import { ProjectSetup } from "@/components/wizard/project-setup";
import { ErrorState } from "@/components/shell/error-state";

export const metadata = { title: "Project setup", robots: { index: false, follow: false } };

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("client", `/dashboard/projects/${id}/setup`);
  const data = await guard(() => getProjectOnboarding(actor, id));
  const open = ["ONBOARDING", "AWAITING_ASSETS", "QUEUED"].includes(data.project.status);
  if (!open || data.locked) {
    return (
      <ErrorState
        compact
        code={data.locked ? "Locked" : "Not yet"}
        icon={data.locked ? "lock" : "clock"}
        title={data.locked ? "The brief is locked — production has started" : "Project setup opens after payment"}
        description={data.locked ? "To keep the edit on track, the brief can't change once editing begins. Send a change request and we'll confirm scope and cost." : "Once your quote is accepted, the contract is signed and the deposit is paid, this form opens so you can tell us exactly what you want."}
        actions={[{ label: data.locked ? "Change requests" : "Back to project", href: `/dashboard/projects/${id}${data.locked ? "?tab=changes" : ""}`, primary: true }]}
      />
    );
  }
  const prefill = await inquiryPrefill(actor);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6"><Link href={`/dashboard/projects/${id}`} className="text-sm font-semibold text-muted hover:text-fg">← {data.project.name}</Link></div>
      <ProjectSetup
        projectId={id}
        projectName={data.project.name}
        form={data.form}
        answers={data.answers}
        step={data.step}
        extraCategories={data.extraCategories}
        firstTime={data.firstTime}
        previousProjects={prefill.previousProjects.filter((p) => p.id !== id)}
      />
    </div>
  );
}
