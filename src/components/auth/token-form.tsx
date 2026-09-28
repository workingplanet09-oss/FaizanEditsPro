"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "./auth-card";

/**
 * Landing for emailed links. Magic/verify links require an explicit click so mail scanners that pre-fetch
 * URLs can't burn the one-time token; invite/reset links collect a password first.
 */
export function TokenForm({ type, token }: { type: "magic" | "verify" | "invite" | "reset"; token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const needsPassword = type === "invite" || type === "reset";
  const mismatch = needsPassword && confirm.length > 0 && confirm !== password;
  const go = useAction(async () => api<{ redirect: string }>("/api/auth/token", { body: { type, token, password: needsPassword ? password : undefined, name: type === "invite" && name ? name : undefined } }), {
    refresh: false,
    onSuccess: (r) => (window.location.href = r.redirect),
  });
  const label = { magic: "Sign me in", verify: "Confirm my email", invite: "Set password & continue", reset: "Save new password" }[type];
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), !mismatch && void go.run())} className="space-y-4">
      {go.error ? <Notice tone="danger">{go.error} If the link has expired, request a new one from the sign-in page.</Notice> : null}
      {type === "invite" ? <Field label="Your name">{(p) => <Input {...p} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field> : null}
      {needsPassword ? (
        <>
          <Field label="New password" required hint="At least 10 characters." error={go.fields.password}>{(p) => <Input {...p} type="password" name="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Confirm password" required error={mismatch ? "Passwords don't match." : undefined}>{(p) => <Input {...p} type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        </>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={go.pending} disabled={needsPassword && (!password || password !== confirm)}>{label}</Button>
    </form>
  );
}
