"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Notice, safeNext } from "./auth-card";

export function LoginForm({ next, google, demo }: { next?: string; google: boolean; demo: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);

  const signIn = useAction(
    async () => api<{ requires2fa: boolean; redirect?: string }>("/api/auth/login", { body: { email, password } }),
    { refresh: false, onSuccess: (r) => (window.location.href = r.requires2fa ? `/login/2fa${next ? `?next=${encodeURIComponent(next)}` : ""}` : safeNext(next, r.redirect ?? "/dashboard")) },
  );
  const magic = useAction(async () => api("/api/auth/magic", { body: { email, next } }), { refresh: false, onSuccess: () => setSent(true) });
  const demoLogin = useAction(async (kind: string) => api<{ redirect: string }>("/api/auth/demo", { body: { kind } }), { refresh: false, onSuccess: (r) => (window.location.href = r.redirect) });

  if (sent) {
    return (
      <div role="status" className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="mail" size={24} /></span>
        <h2 className="mt-4 text-lg font-extrabold">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted">If an account exists for <b className="text-fg">{email}</b>, a sign-in link is on its way. It expires in 15 minutes.</p>
        <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm font-semibold text-accent hover:underline">Use a different email</button>
      </div>
    );
  }

  return (
    <div>
      <div role="tablist" aria-label="Sign-in method" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {([["password", "Password"], ["magic", "Email me a link"]] as const).map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("h-9 rounded-lg text-sm font-semibold transition", mode === k ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>{l}</button>
        ))}
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void (mode === "password" ? signIn.run() : magic.run());
        }}
        className="space-y-4"
      >
        {(mode === "password" ? signIn.error : magic.error) ? <Notice tone="danger">{mode === "password" ? signIn.error : magic.error}</Notice> : null}
        <Field label="Email" required error={(mode === "password" ? signIn.fields : magic.fields).email}>
          {(p) => <Input {...p} type="email" name="email" autoComplete="username" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />}
        </Field>
        {mode === "password" ? (
          <Field label="Password" required>
            {(p) => <Input {...p} type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        ) : (
          <p className="text-xs text-subtle">No password needed — we'll email you a one-time link that signs you in.</p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={signIn.pending || magic.pending} disabled={!email || (mode === "password" && !password)}>
          {mode === "password" ? "Sign in" : "Send sign-in link"}
        </Button>
        {mode === "password" ? <div className="text-center"><Link href="/forgot-password" className="text-sm font-semibold text-muted hover:text-fg">Forgot your password?</Link></div> : null}
      </form>

      {google ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <a href="/api/auth/google" className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong text-sm font-semibold transition hover:bg-surface-2">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </a>
        </>
      ) : null}

      {demo ? (
        <div className="mt-7 rounded-2xl border border-dashed border-line-strong bg-surface-2/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-subtle">Demo mode</p>
          <p className="mt-1 text-xs text-muted">Explore with sample data — no signup needed.</p>
          {demoLogin.error ? <p role="alert" className="mt-2 text-xs font-medium text-danger">{demoLogin.error}</p> : null}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["client", "editor", "admin"] as const).map((k) => (
              <Button key={k} size="sm" variant="outline" loading={demoLogin.pending} onClick={() => void demoLogin.run(k)}>{k[0].toUpperCase() + k.slice(1)}</Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
