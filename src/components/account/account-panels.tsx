"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";
import { formatDateTime, timeAgo } from "@/lib/format";

export function ProfileForm({ name, email, phone, timezone }: { name: string; email: string; phone: string; timezone: string }) {
  const toast = useToast();
  const [v, setV] = useState({ name, phone, timezone });
  const go = useAction(async () => api("/api/auth/account", { method: "PATCH", body: { name: v.name, phone: v.phone || null, timezone: v.timezone || null } }), { onSuccess: () => toast.success("Profile saved"), onError: (e) => toast.error("Couldn't save", e.message) });
  return (
    <Card>
      <CardHeader title="Your profile" description="How your name appears on messages, approvals and signatures." />
      <form onSubmit={(e) => (e.preventDefault(), void go.run())} className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2">
        <Field label="Full name" required error={go.fields.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" />}</Field>
        <Field label="Email" optional={false} hint="Contact the studio to change your sign-in email.">{(p) => <Input {...p} value={email} disabled />}</Field>
        <Field label="Phone">{(p) => <Input {...p} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} autoComplete="tel" />}</Field>
        <Field label="Time zone">{(p) => <Input {...p} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} placeholder="e.g. Europe/London" />}</Field>
        <div className="sm:col-span-2"><Button type="submit" loading={go.pending} disabled={v.name.trim().length < 2}>Save profile</Button></div>
      </form>
    </Card>
  );
}

export function NotificationPrefs({ prefs }: { prefs: { category: string; inApp: boolean; email: boolean }[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(prefs);
  const LABEL: Record<string, string> = { PROJECT: "Project updates", MESSAGE: "Messages", PAYMENT: "Invoices & payments", REVIEW: "Reviews & feedback", SYSTEM: "System & account" };
  const save = useAction(async (next: typeof rows) => api("/api/notifications/preferences", { method: "PUT", body: { prefs: next } }), { refresh: false, onSuccess: () => toast.success("Notification settings saved"), onError: (e) => toast.error("Couldn't save", e.message) });
  const set = (cat: string, key: "inApp" | "email", val: boolean) => {
    const next = rows.map((r) => (r.category === cat ? { ...r, [key]: val } : r));
    setRows(next);
    void save.run(next);
  };
  return (
    <Card>
      <CardHeader title="Notifications" description="Choose how you hear about each type of update." />
      <div className="px-5 pb-5">
        <div className="hidden grid-cols-[1fr_6rem_6rem] items-center gap-3 border-b border-line pb-2 text-xs font-semibold text-subtle sm:grid"><span>Type</span><span className="text-center">In-app</span><span className="text-center">Email</span></div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.category} className="grid grid-cols-1 items-center gap-3 py-3.5 sm:grid-cols-[1fr_6rem_6rem]">
              <span className="text-sm font-semibold">{LABEL[r.category] ?? r.category}</span>
              <span className="flex items-center justify-between sm:justify-center"><span className="text-xs text-subtle sm:hidden">In-app</span><Switch checked={r.inApp} onChange={(v) => set(r.category, "inApp", v)} label={<span className="sr-only">In-app {LABEL[r.category]}</span>} /></span>
              <span className="flex items-center justify-between sm:justify-center"><span className="text-xs text-subtle sm:hidden">Email</span><Switch checked={r.email} onChange={(v) => set(r.category, "email", v)} label={<span className="sr-only">Email {LABEL[r.category]}</span>} /></span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function SecurityPanel({ twoFactorEnabled, sessions }: { twoFactorEnabled: boolean; sessions: { id: string; ip: string | null; userAgent: string | null; lastUsedAt: string | Date; current: boolean }[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const change = useAction(async () => api("/api/auth/account/password", { body: { current: pw.current, next: pw.next } }), {
    onSuccess: () => {
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed", "Other devices were signed out.");
    },
  });
  const revoke = useAction(async (id: string) => api("/api/auth/account/sessions", { method: "DELETE", body: { id } }), { onSuccess: () => toast.success("Session ended") });

  // 2FA
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [offPw, setOffPw] = useState("");
  const [offCode, setOffCode] = useState("");
  const [offOpen, setOffOpen] = useState(false);
  const begin = useAction(async () => api<{ qrDataUrl: string; secret: string }>("/api/auth/2fa/setup", { body: {} }), { refresh: false, onSuccess: setSetup });
  const enable = useAction(async () => api<{ recoveryCodes: string[] }>("/api/auth/2fa/enable", { body: { code } }), { onSuccess: (r) => (setCodes(r.recoveryCodes), setSetup(null), setCode("")) });
  const disable = useAction(async () => api("/api/auth/2fa/disable", { body: { password: offPw, code: offCode } }), { onSuccess: () => (setOffOpen(false), setOffPw(""), setOffCode(""), toast.success("Two-factor authentication turned off")) });

  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.next;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Password" />
        <form onSubmit={(e) => (e.preventDefault(), !mismatch && void change.run())} className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">
          {change.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger sm:col-span-3">{change.error}</p> : null}
          <Field label="Current password" required>{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
          <Field label="New password" required hint="At least 10 characters." error={change.fields.password}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <Field label="Confirm new password" required error={mismatch ? "Passwords don't match." : undefined}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
          <div className="sm:col-span-3"><Button type="submit" loading={change.pending} disabled={!pw.current || pw.next.length < 10 || mismatch || !pw.confirm}>Change password</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Two-factor authentication" description="Add a second step at sign-in using an authenticator app." action={twoFactorEnabled ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success"><Icon name="shield" size={13} /> On</span> : null} />
        <div className="px-5 pb-6">
          {codes ? (
            <div className="rounded-2xl border border-warning/40 bg-warning-soft/60 p-5">
              <h3 className="font-extrabold">Save your recovery codes</h3>
              <p className="mt-1 text-sm text-muted">Each code works once if you lose your phone. This is the only time they're shown.</p>
              <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">{codes.map((c) => <li key={c} className="rounded-lg bg-surface px-3 py-2 text-center">{c}</li>)}</ul>
              <Button className="mt-4" variant="dark" onClick={() => (navigator.clipboard?.writeText(codes.join("\n")), toast.success("Copied to clipboard"))} icon="copy">Copy all</Button>
              <Button className="ml-2 mt-4" variant="ghost" onClick={() => { setCodes(null); router.refresh(); }}>I've saved them</Button>
            </div>
          ) : setup ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="QR code to scan with your authenticator app" width={220} height={220} className="rounded-2xl border border-line bg-white" />
              <div className="space-y-3">
                <p className="text-sm">1. Scan the code with Google Authenticator, 1Password, Authy or similar.<br />2. Enter the 6-digit code it shows.</p>
                <p className="text-xs text-subtle">Can't scan? Enter this key manually: <span className="select-all font-mono">{setup.secret}</span></p>
                {enable.error ? <p role="alert" className="text-sm font-medium text-danger">{enable.error}</p> : null}
                <div className="flex max-w-xs gap-2"><Input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest" placeholder="123456" /><Button loading={enable.pending} disabled={code.length < 6} onClick={() => void enable.run()}>Turn on</Button></div>
              </div>
            </div>
          ) : twoFactorEnabled ? (
            offOpen ? (
              <div className="max-w-md space-y-3">
                {disable.error ? <p role="alert" className="text-sm font-medium text-danger">{disable.error}</p> : null}
                <Field label="Password" required>{(p) => <Input {...p} type="password" value={offPw} onChange={(e) => setOffPw(e.target.value)} />}</Field>
                <Field label="Authenticator code" required>{(p) => <Input {...p} inputMode="numeric" value={offCode} onChange={(e) => setOffCode(e.target.value)} />}</Field>
                <div className="flex gap-2"><Button variant="danger" loading={disable.pending} disabled={!offPw || offCode.length < 6} onClick={() => void disable.run()}>Turn off 2FA</Button><Button variant="ghost" onClick={() => setOffOpen(false)}>Cancel</Button></div>
              </div>
            ) : <Button variant="outline" onClick={() => setOffOpen(true)}>Turn off two-factor</Button>
          ) : (
            <Button icon="shield" loading={begin.pending} onClick={() => void begin.run()}>Set up two-factor authentication</Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Active sessions" description="Devices currently signed in to your account." />
        <ul className="divide-y divide-line px-5 pb-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <Icon name={/mobile|iphone|android/i.test(s.userAgent ?? "") ? "smartphone" : "monitor"} size={20} className="text-muted" />
              <div className="min-w-0 flex-1 basis-56"><div className="truncate text-sm font-semibold">{(s.userAgent ?? "Unknown device").replace(/\(.*?\)/g, "").slice(0, 60) || "Browser"}{s.current ? <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">This device</span> : null}</div><div className="text-xs text-subtle" title={formatDateTime(s.lastUsedAt)}>{s.ip ?? "Unknown IP"} · active {timeAgo(s.lastUsedAt)}</div></div>
              {!s.current ? <Button size="sm" variant="outline" loading={revoke.pending} onClick={() => void revoke.run(s.id)}>Sign out</Button> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
