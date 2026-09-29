import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice, safeNext } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getActor } from "@/server/auth/actor";
import { googleConfigured } from "@/server/services/auth";
import { env } from "@/server/env";
import { homeForRoles } from "@/lib/permissions";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Sign in", path: "/login", noindex: true });

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up for this site yet. Use your email instead.",
  google_failed: "Google sign-in didn't complete. Please try again or use your email.",
  google_unverified: "Google couldn't confirm that email address. Use another way to sign in.",
  suspended: "This account has been suspended. Contact the studio for help.",
};

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const actor = await getActor();
  const next = one(sp.next);
  if (actor) redirect(safeNext(next, homeForRoles(actor.roleKeys, actor.permissions)));
  const error = one(sp.error);
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your client portal to review videos, approve edits and manage projects."
      footer={<>New here? <Link href="/register" className="font-bold text-fg hover:text-accent-text">Create an account</Link> or <Link href="/start-project" className="font-bold text-fg hover:text-accent-text">start a project</Link></>}
    >
      {one(sp.expired) ? <Notice>Your session expired. Please sign in again.</Notice> : null}
      {one(sp.reset) ? <Notice tone="success">Password updated. Sign in with your new password.</Notice> : null}
      {one(sp.verified) ? <Notice tone="success">Email confirmed. You can sign in now.</Notice> : null}
      {error ? <Notice tone="danger">{ERRORS[error] ?? "Something went wrong signing you in."}</Notice> : null}
      <LoginForm next={next} google={googleConfigured()} demo={env.demoMode} />
    </AuthCard>
  );
}
