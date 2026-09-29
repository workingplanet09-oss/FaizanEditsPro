"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";

interface MeetingType {
  key: string;
  label: string;
  minutes: number;
  description: string;
}

interface Slots {
  enabled: boolean;
  slots: string[];
  timezone: string;
  minutes?: number;
}

export function BookingForm({ types }: { types: MeetingType[] }) {
  const [type, setType] = useState(types[0]?.key ?? "DISCOVERY_CALL");
  const [slots, setSlots] = useState<Slots | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [v, setV] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ startsAt: string; meetingUrl: string | null; typeLabel: string } | null>(null);
  const started = useRef(Date.now());
  // The browser's zone is only known after mount; reading it during render would differ from the server-rendered HTML.
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  const load = useCallback(async (t: string) => {
    setSlots(null);
    setDay(null);
    setSlot(null);
    try {
      setSlots(await api<Slots>(`/api/booking/slots?type=${t}`));
    } catch {
      setSlots({ enabled: true, slots: [], timezone: "UTC" });
    }
  }, []);
  useEffect(() => void load(type), [type, load]);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots?.slots ?? []) {
      const d = s.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [slots]);
  const days = [...byDay.keys()];
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [days, day]);

  const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (state === "done" && result)
    return (
      <div role="status" className="animate-pop rounded-[var(--radius-card)] border border-line bg-surface p-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" size={26} strokeWidth={2.5} /></span>
        <h2 className="mt-5 text-2xl font-extrabold">You're booked in</h2>
        <p className="mt-2 text-muted">{result.typeLabel} · {new Date(result.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-subtle">We've emailed your confirmation{result.meetingUrl ? " with the meeting link" : ""}.</p>
        {result.meetingUrl ? <a href={result.meetingUrl} className="mt-6 inline-flex h-11 items-center rounded-xl bg-accent px-6 text-sm font-bold text-accent-fg">Open meeting link</a> : null}
      </div>
    );

  if (slots && !slots.enabled)
    return <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">Online booking is currently switched off. Please use the contact form and we'll arrange a time.</p>;

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!slot) return setError("Choose a time first.");
        setState("sending");
        setError(null);
        setFields({});
        try {
          const r = await api<{ startsAt: string; meetingUrl: string | null; typeLabel: string }>("/api/booking", { body: { type, startsAt: slot, ...v, phone: v.phone || undefined, company: v.company || undefined, notes: v.notes || undefined, timezone: tz || "UTC", t: started.current } });
          setResult(r);
          setState("done");
        } catch (err) {
          setState("idle");
          if (err instanceof ApiError) {
            setError(err.message);
            setFields(err.fields ?? {});
            if (err.status === 409) void load(type);
          } else setError("Something went wrong. Please try again.");
        }
      }}
    >
      <fieldset>
        <legend className="mb-3 text-sm font-bold">1 · What would you like to talk about?</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <label key={t.key} className={cn("cursor-pointer rounded-2xl border p-4 transition", type === t.key ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:border-subtle")}>
              <input type="radio" name="type" className="sr-only" checked={type === t.key} onChange={() => setType(t.key)} />
              <span className="flex items-center justify-between"><span className="font-bold">{t.label}</span><span className="text-xs text-muted">{t.minutes} min</span></span>
              <span className="mt-1 block text-xs text-muted">{t.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-bold">2 · Pick a time</legend>
        <p className="mb-3 text-xs text-subtle" suppressHydrationWarning>Times shown in your timezone{tz ? ` (${tz})` : ""}.</p>
        {!slots ? (
          <div role="status" className="grid grid-cols-3 gap-2 sm:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : days.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-5 text-sm text-muted">No open slots in the next few weeks. Please send us a message and we'll find a time.</p>
        ) : (
          <>
            <div className="scroll-x flex gap-2 pb-2" role="tablist" aria-label="Choose a day">
              {days.slice(0, 21).map((d) => (
                <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => { setDay(d); setSlot(null); }} className={cn("shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold", day === d ? "border-fg bg-fg text-bg" : "border-line-strong hover:border-subtle")}>
                  {fmtDay(d)}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {(day ? byDay.get(day) ?? [] : []).map((s) => (
                <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)} className={cn("rounded-xl border py-3 text-sm font-semibold transition", slot === s ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent")}>
                  {fmtTime(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm font-bold">3 · Your details</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name" required error={fields.name}>{(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" />}</Field>
          <Field label="Email" required error={fields.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" />}</Field>
          <Field label="Phone" error={fields.phone}>{(p) => <Input {...p} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
          <Field label="Company / channel" error={fields.company}>{(p) => <Input {...p} value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />}</Field>
        </div>
        <Field label="Anything we should know?" error={fields.notes}>{(p) => <Textarea {...p} rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
      </fieldset>

      {error ? <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"><Icon name="alert" size={16} />{error}</p> : null}
      <Button type="submit" size="lg" loading={state === "sending"} disabled={!slot} iconRight="calendar">Confirm booking</Button>
    </form>
  );
}
