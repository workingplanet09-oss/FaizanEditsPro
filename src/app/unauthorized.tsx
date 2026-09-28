import { ErrorState } from "@/components/shell/error-state";

export const metadata = { title: "Session expired" };

export default function Unauthorized() {
  return (
    <main id="main">
      <ErrorState
        code="401"
        icon="lock"
        title="Your session has expired"
        description="For your security we sign you out after a period of inactivity. Sign in again and you'll land right back where you were — nothing you saved is lost."
        actions={[{ label: "Sign in again", href: "/login?expired=1", primary: true }]}
      />
    </main>
  );
}
