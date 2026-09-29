import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Reset your password", path: "/forgot-password", noindex: true });

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="Enter your email and we'll send you a link to choose a new one." footer={<Link href="/login" className="font-bold text-fg hover:text-accent-text">Back to sign in</Link>}>
      <ForgotForm />
    </AuthCard>
  );
}
