"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Notice } from "./auth-card";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const go = useAction(async () => api("/api/auth/forgot-password", { body: { email } }), { refresh: false, onSuccess: () => setSent(true) });
  if (sent) {
    return (
      <div role="status" className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="mail" size={24} /></span>
        <p className="mt-4 text-sm text-muted">If an account exists for <b className="text-fg">{email}</b>, we've sent a reset link. It expires in one hour.</p>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="space-y-4">
      {go.error ? <Notice tone="danger">{go.error}</Notice> : null}
      <Field label="Email" required>{(p) => <Input {...p} type="email" name="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Button type="submit" size="lg" className="w-full" loading={go.pending} disabled={!email}>Send reset link</Button>
    </form>
  );
}
