import { AuthCard } from "@/components/auth/auth-card";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Two-step verification", path: "/login/2fa", noindex: true });

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Two-step verification" description="Enter the code from your authenticator app to finish signing in.">
      <TwoFactorForm next={next} />
    </AuthCard>
  );
}
