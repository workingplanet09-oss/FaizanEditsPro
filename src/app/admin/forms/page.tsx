import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { adminOverview } from "@/server/services/onboarding";
import { guard, first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { FormBuilder } from "@/components/admin/form-builder";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Project form", path: "/admin/forms", noindex: true });

export default async function FormsAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/forms");
  if (!can(actor, "forms:manage")) denyPage();
  const sp = await searchParams;
  const key = first(sp.form) === "project_onboarding" ? "project_onboarding" : "inquiry";
  const { form, categories, forms } = await guard(() => adminOverview(actor, key));
  return (
    <>
      <PageHeader title="Project form builder" description="Edit the questions visitors answer when they start a project, and the brief clients fill after payment. Everything is stored in the database — no code changes needed." />
      <FormBuilder form={form as any} forms={forms} categories={categories.map((c) => ({ key: c.key, name: c.name }))} activeSection={first(sp.section) ?? form.sections[0]?.key ?? ""} />
    </>
  );
}
