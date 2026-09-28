"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "./auth-card";

export function RegisterForm({ referralCode }: { referralCode?: string }) {
  const [v, setV] = useState({ name: "", email: "", company: "", password: "" });
  const [hp, setHp] = useState("");
  const started = useRef(Date.now());
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const go = useAction(async () => api<{ redirect: string; needsVerification: boolean }>("/api/auth/register", { body: { ...v, company: v.company || undefined, referralCode, hp, t: started.current } }), {
    refresh: false,
    onSuccess: (r) => (window.location.href = r.redirect),
  });
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="space-y-4">
      {go.error ? <Notice tone="danger">{go.error}</Notice> : null}
      <Field label="Full name" required error={go.fields.name}>{(p) => <Input {...p} name="name" autoComplete="name" autoFocus value={v.name} onChange={set("name")} />}</Field>
      <Field label="Email" required error={go.fields.email}>{(p) => <Input {...p} type="email" name="email" autoComplete="email" inputMode="email" value={v.email} onChange={set("email")} placeholder="you@company.com" />}</Field>
      <Field label="Company or channel" error={go.fields.company}>{(p) => <Input {...p} name="company" autoComplete="organization" value={v.company} onChange={set("company")} />}</Field>
      <Field label="Password" required hint="At least 10 characters." error={go.fields.password}>{(p) => <Input {...p} type="password" name="password" autoComplete="new-password" value={v.password} onChange={set("password")} />}</Field>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave empty<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
      <Button type="submit" size="lg" className="w-full" loading={go.pending} disabled={!v.name || !v.email || !v.password}>Create account</Button>
      <p className="text-center text-xs text-subtle">We'll email a link to confirm your address. Your projects appear once it's confirmed.</p>
    </form>
  );
}
