import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { TokenForm } from "@/components/auth/token-form";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Continue", path: "/auth/verify", noindex: true });

const COPY = {
  magic: { title: "Sign in to your portal", body: "Confirm to finish signing in on this device." },
  verify: { title: "Confirm your email", body: "One click and your account is verified." },
  invite: { title: "Welcome — set up your account", body: "Choose a password to open your client portal." },
  reset: { title: "Choose a new password", body: "You'll be signed out everywhere else once it's saved." },
} as const;

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ type?: string; token?: string }> }) {
  const { type, token } = await searchParams;
  if (!token || !type || !(type in COPY)) {
    return (
      <AuthCard title="This link isn't valid" description="It may be incomplete or already used. Request a fresh one and try again." footer={<Link href="/login" className="font-bold text-fg hover:text-accent-text">Go to sign in</Link>}>
        <Link href="/forgot-password" className="text-sm font-semibold text-accent-text hover:underline">Reset my password</Link>
      </AuthCard>
    );
  }
  const t = type as keyof typeof COPY;
  return (
    <AuthCard title={COPY[t].title} description={COPY[t].body}>
      <TokenForm type={t} token={token} />
    </AuthCard>
  );
}
