import { ErrorState } from "@/components/shell/error-state";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <main id="main">
      <ErrorState
        code="403"
        icon="lock"
        title="You don't have access to this"
        description="This area is limited to certain team members or to the account that owns it. If you think that's a mistake, ask the account owner or the studio to grant access."
        actions={[
          { label: "Back to my dashboard", href: "/dashboard", primary: true },
          { label: "Switch account", href: "/login" },
        ]}
      />
    </main>
  );
}
