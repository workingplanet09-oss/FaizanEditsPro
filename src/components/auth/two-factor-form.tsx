"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice, safeNext } from "./auth-card";

export function TwoFactorForm({ next }: { next?: string }) {
  const [code, setCode] = useState("");
  const go = useAction(async () => api<{ redirect: string }>("/api/auth/2fa/verify", { body: { code } }), { refresh: false, onSuccess: (r) => (window.location.href = safeNext(next, r.redirect)) });
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="space-y-4">
      {go.error ? <Notice tone="danger">{go.error}</Notice> : null}
      <Field label="Authentication code" required hint="6 digits from your authenticator app, or a recovery code.">
        {(p) => <Input {...p} name="code" inputMode="text" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="text-center font-mono text-lg tracking-[0.3em]" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={go.pending} disabled={code.replace(/\s/g, "").length < 6}>Verify</Button>
    </form>
  );
}
