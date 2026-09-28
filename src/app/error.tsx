"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shell/error-state";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main">
      <ErrorState
        code="500"
        icon="warning"
        title="Something went wrong on our side"
        description="The page hit an unexpected error. It's been logged and your data is safe. Try again — if it keeps happening, let us know."
        actions={[{ label: "Go to homepage", href: "/" }]}
        footer={
          <div className="flex flex-col items-center gap-3">
            <Button onClick={reset}>Try again</Button>
            {error.digest ? <span>Reference: {error.digest}</span> : null}
          </div>
        }
      />
    </main>
  );
}
