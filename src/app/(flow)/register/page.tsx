import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getActor } from "@/server/auth/actor";
import { homeForRoles } from "@/lib/permissions";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Create your account", path: "/register", noindex: true });

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const actor = await getActor();
  if (actor) redirect(homeForRoles(actor.roleKeys, actor.permissions));
  return (
    <AuthCard title="Create your account" description="Track projects, review drafts and approve videos — all in one place." footer={<>Already have an account? <Link href="/login" className="font-bold text-fg hover:text-accent-text">Sign in</Link></>}>
      <RegisterForm referralCode={ref} />
    </AuthCard>
  );
}
