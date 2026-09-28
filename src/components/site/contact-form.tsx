"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { captureAttribution } from "@/lib/attribution";

const REASONS = [
  { value: "GENERAL", label: "General inquiry" },
  { value: "PROJECT", label: "Project inquiry" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "AGENCY", label: "Agency collaboration" },
  { value: "CAREER", label: "Career / application" },
];

export function ContactForm({ defaultReason = "GENERAL" }: { defaultReason?: string }) {
  const [v, setV] = useState({ name: "", email: "", phone: "", company: "", reason: defaultReason, message: "" });
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const started = useRef(Date.now());
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  if (state === "done")
    return (
      <div role="status" className="rounded-[var(--radius-card)] border border-line bg-surface p-10 text-center animate-pop">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" size={26} strokeWidth={2.5} /></span>
        <h2 className="mt-5 text-2xl font-extrabold">Message sent</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">Thanks — we've emailed you a confirmation and we'll reply within one business day.</p>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        setError(null);
        setFields({});
        try {
          const a = captureAttribution();
          await api("/api/contact", { body: { ...v, phone: v.phone || undefined, company: v.company || undefined, hp, t: started.current, source: a.referrer || undefined, utm: Object.fromEntries(Object.entries(a.utm).filter(([, x]) => x)) } });
          setState("done");
        } catch (err) {
          setState("idle");
          if (err instanceof ApiError) {
            setError(err.message);
            setFields(err.fields ?? {});
          } else setError("Something went wrong. Please try again.");
        }
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" required error={fields.name}>{(p) => <Input {...p} value={v.name} onChange={set("name")} autoComplete="name" />}</Field>
        <Field label="Email" required error={fields.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={set("email")} autoComplete="email" />}</Field>
        <Field label="Phone" error={fields.phone}>{(p) => <Input {...p} type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" />}</Field>
        <Field label="Company" error={fields.company}>{(p) => <Input {...p} value={v.company} onChange={set("company")} autoComplete="organization" />}</Field>
      </div>
      <Field label="What's this about?" required>{(p) => <Select {...p} value={v.reason} onChange={set("reason")}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>}</Field>
      <Field label="Message" required error={fields.message} hint="The more context, the better we can help.">{(p) => <Textarea {...p} value={v.message} onChange={set("message")} rows={6} />}</Field>
      {/* honeypot — hidden from people, irresistible to bots */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      </div>
      {error ? <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"><Icon name="alert" size={16} />{error}</p> : null}
      <Button type="submit" size="lg" loading={state === "sending"} iconRight="send">Send message</Button>
    </form>
  );
}
