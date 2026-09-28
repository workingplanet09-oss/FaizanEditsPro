import { ErrorState } from "@/components/shell/error-state";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main">
      <ErrorState
        code="404"
        icon="search"
        title="We couldn't find that page"
        description="The link may be out of date, or the page may have moved. Nothing is broken on your end."
        actions={[
          { label: "Go to homepage", href: "/", primary: true },
          { label: "See our work", href: "/work" },
          { label: "Sign in", href: "/login" },
        ]}
      />
    </main>
  );
}
