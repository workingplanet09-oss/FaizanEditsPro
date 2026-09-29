"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/primitives";
import { visibleQuestions, visibleSections, validateAnswer, type Answers, type FormDef, type SectionDef } from "@/lib/conditions";
import { Uploader } from "@/components/portal/uploader";
import { QuestionField } from "./question-field";

export interface WizardProps<R> {
  form: FormDef;
  mode: "inquiry" | "project";
  initialAnswers: Answers;
  initialStep?: number;
  extraCategories?: string[];
  skipSections?: string[];
  /** where the draft lives: PUT { token?, data, step } (inquiry) or PUT { answers, step } (project) */
  saveDraft: (token: string, answers: Answers, step: number) => Promise<void>;
  /** inquiry only: restore a saved draft */
  restoreDraft?: (token: string) => Promise<{ data: Answers; step: number } | null>;
  storageKey?: string;
  submit: (answers: Answers, ctx: { token: string; hp: string; startedAt: number }) => Promise<R>;
  renderDone: (result: R, answers: Answers) => React.ReactNode;
  exitHref: string;
  uploads: { purpose: "lead_reference" | "asset"; projectId?: string; folderKey?: string };
  intro?: React.ReactNode;
  submitLabel?: string;
  previousProjects?: { id: string; name: string }[];
  onUsePrevious?: (projectId: string) => Promise<Answers | null>;
  firstTime?: boolean;
}

function randomId(n = 24) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/**
 * Generic DB-driven wizard: renders whatever sections/questions the form definition contains, shows/hides questions
 * live using the shared conditional-logic engine, validates per step, autosaves (debounced) and can resume.
 * Used for both the public "Start a Project" flow and the client's post-payment project setup.
 */
export function FormWizard<R>(p: WizardProps<R>) {
  const { form, mode, extraCategories = [], skipSections = [] } = p;
  const [answers, setAnswers] = useState<Answers>(p.initialAnswers);
  const [stepKey, setStepKey] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [resume, setResume] = useState<{ data: Answers; step: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<R | null>(null);
  const [hp, setHp] = useState("");
  const startedAt = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);
  const uploadedNames = useRef<Record<string, string[]>>({});

  const sections = useMemo<SectionDef[]>(() => visibleSections(form, answers, extraCategories).filter((s) => !skipSections.includes(s.key)), [form, answers, extraCategories, skipSections]);
  const keys = useMemo(() => [...sections.map((s) => s.key), "__review"], [sections]);
  const idx = Math.max(0, keys.indexOf(stepKey || keys[0]));
  const currentKey = keys[idx];
  const section = sections.find((s) => s.key === currentKey);
  const total = keys.length;

  // ───── token + restore ─────
  useEffect(() => {
    let t = "";
    try {
      t = (p.storageKey && localStorage.getItem(p.storageKey)) || "";
    } catch {
      /* private mode */
    }
    if (!t) {
      t = randomId(24);
      try {
        if (p.storageKey) localStorage.setItem(p.storageKey, t);
      } catch {
        /* ignore */
      }
    }
    setToken(t);
    if (p.restoreDraft) {
      void p.restoreDraft(t).then((d) => {
        if (d && Object.keys(d.data).length > 0 && JSON.stringify(d.data) !== JSON.stringify(p.initialAnswers)) setResume(d);
      });
    } else if ((p.initialStep ?? 0) > 0) {
      setStepKey(sectionsAtLoad()[Math.min(p.initialStep ?? 0, sectionsAtLoad().length - 1)]?.key ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function sectionsAtLoad() {
    return visibleSections(form, p.initialAnswers, extraCategories).filter((s) => !skipSections.includes(s.key));
  }

  // ───── debounced autosave ─────
  useEffect(() => {
    if (!dirty.current || !token || result) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await p.saveDraft(token, answers, idx);
        setSaveState("saved");
      } catch {
        setSaveState("offline");
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, idx, token]);

  // warn before losing unsaved (unsent) work only if a save failed
  useEffect(() => {
    if (saveState !== "offline") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saveState]);

  const go = useCallback(
    (key: string) => {
      setStepKey(key);
      setSubmitError(null);
      dirty.current = true;
      requestAnimationFrame(() => {
        heading.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [],
  );

  const setValue = (key: string, v: any) => {
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  };

  function validateSection(s: SectionDef): Record<string, string> {
    const e: Record<string, string> = {};
    for (const q of visibleQuestions(form, s, answers, extraCategories)) {
      if (q.type === "FILE") continue;
      const err = validateAnswer(q, answers[q.key]);
      if (err) e[q.key] = err;
    }
    return e;
  }

  function next() {
    if (section) {
      const e = validateSection(section);
      if (Object.keys(e).length) {
        setErrors(e);
        requestAnimationFrame(() => {
          const first = document.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
          first?.scrollIntoView({ block: "center", behavior: "smooth" });
          (document.querySelector<HTMLElement>('[aria-invalid="true"]') ?? undefined)?.focus?.();
        });
        return;
      }
    }
    setErrors({});
    go(keys[Math.min(keys.length - 1, idx + 1)]);
  }

  async function doSubmit() {
    // re-validate everything — the server does it again, this just gives faster, friendlier feedback
    for (const s of sections) {
      const e = validateSection(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setSubmitError("A few answers need attention before you can submit.");
        return go(s.key);
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await p.submit(answers, { token, hp, startedAt: startedAt.current });
      try {
        if (p.storageKey) localStorage.removeItem(p.storageKey);
      } catch {
        /* ignore */
      }
      setResult(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError) {
        setSubmitError(e.message);
        if (e.fields && Object.keys(e.fields).length) {
          setErrors(e.fields);
          const s = sections.find((sec) => sec.questions.some((q) => q.key in e.fields!));
          if (s) go(s.key);
        }
      } else setSubmitError("Something went wrong. Your answers are safe — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <>{p.renderDone(result, answers)}</>;

  const pct = Math.round(((idx + 1) / total) * 100);
  const isReview = currentKey === "__review";

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* progress */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
          <span aria-live="polite">Step {idx + 1} of {total}</span>
          <span className="flex items-center gap-1.5" role="status">
            {saveState === "saving" ? (<><Icon name="loader" size={12} className="animate-spin" /> Saving…</>) : saveState === "saved" ? (<><Icon name="check" size={12} className="text-success" /> Progress saved</>) : saveState === "offline" ? (<span className="text-danger">Couldn't save — check your connection</span>) : null}
          </span>
        </div>
        <Progress value={pct} label={`Step ${idx + 1} of ${total}`} />
      </div>

      {resume ? (
        <div role="region" aria-label="Saved progress" className="mb-6 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm"><span className="font-bold">Continue where you left off?</span> <span className="text-muted">We saved your earlier answers.</span></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setAnswers(resume.data); const s = visibleSections(form, resume.data, extraCategories).filter((x) => !skipSections.includes(x.key)); setStepKey(s[Math.min(resume.step, s.length - 1)]?.key ?? ""); setResume(null); dirty.current = true; }}>Continue</Button>
            <Button size="sm" variant="ghost" onClick={() => { setResume(null); const t = randomId(24); try { p.storageKey && localStorage.setItem(p.storageKey, t); } catch {} setToken(t); }}>Start over</Button>
          </div>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isReview) void doSubmit();
          else next();
        }}
        className="space-y-8"
      >
        <header>
          <h1 ref={heading} tabIndex={-1} className="text-[clamp(1.7rem,4vw,2.5rem)] font-extrabold leading-tight tracking-tight outline-none">
            {isReview ? "Review & submit" : section?.title}
          </h1>
          <p className="mt-2 text-muted">{isReview ? "Everything look right? You can edit any section before sending." : section?.description}</p>
        </header>

        {idx === 0 && p.previousProjects?.length ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <label className="text-sm font-bold" htmlFor="prev-project">Use previous project settings</label>
            <p className="text-xs text-muted">Start from an earlier project and change only what's different.</p>
            <select id="prev-project" defaultValue="" onChange={async (e) => { if (!e.target.value || !p.onUsePrevious) return; const prev = await p.onUsePrevious(e.target.value); if (prev) { setAnswers((a) => ({ ...prev, ...a, ...Object.fromEntries(Object.entries(prev)) })); dirty.current = true; } }} className="mt-2 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm">
              <option value="">Choose a project…</option>
              {p.previousProjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        ) : null}

        {p.firstTime && idx === 0 && mode === "project" ? (
          <div className="flex gap-3 rounded-2xl bg-info-soft p-4 text-sm text-info"><Icon name="info" size={18} className="mt-0.5 shrink-0" /><p><b>First project with us?</b> Take a few minutes here — the more detail you give, the fewer revisions you'll need. Every answer is saved automatically and can be edited before production starts.</p></div>
        ) : null}
        {idx === 0 && p.intro ? p.intro : null}

        {isReview ? (
          <div className="space-y-4">
            {sections.map((s) => {
              const qs = visibleQuestions(form, s, answers, extraCategories).filter((q) => answers[q.key] !== undefined && answers[q.key] !== "" && !(Array.isArray(answers[q.key]) && answers[q.key].length === 0));
              if (!qs.length) return null;
              return (
                <section key={s.key} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-extrabold">{qs.length === 1 && qs[0].text === s.title ? "" : s.title}</h2>
                    <button type="button" onClick={() => go(s.key)} className="text-xs font-bold text-accent-text hover:underline">Edit</button>
                  </div>
                  <dl className="space-y-2.5">
                    {qs.map((q) => {
                      const v = answers[q.key];
                      const label = (x: any) => q.options.find((o) => o.value === String(x))?.label ?? String(x);
                      const shown = q.type === "FILE" ? (uploadedNames.current[q.key] ?? []).join(", ") || "Files attached" : Array.isArray(v) ? v.map(label).join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : label(v);
                      return (
                        <div key={q.key} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[38%_1fr] sm:gap-4">
                          <dt className="text-xs text-subtle">{q.text}</dt>
                          <dd className="whitespace-pre-line break-words text-sm font-medium">{shown}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              );
            })}
            {mode === "inquiry" ? <p className="text-xs text-subtle">By submitting you agree to our <Link className="underline" href="/privacy" target="_blank">Privacy Policy</Link>. We'll only use your details to respond to this request.</p> : null}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave empty<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
          </div>
        ) : section ? (
          <div className="space-y-7">
            {visibleQuestions(form, section, answers, extraCategories).map((q) => (
              <div key={q.key} className="animate-fade-in">
                <QuestionField
                  q={q}
                  value={answers[q.key]}
                  error={errors[q.key]}
                  onChange={(v) => setValue(q.key, v)}
                  files={
                    <Uploader
                      purpose={p.uploads.purpose}
                      projectId={p.uploads.projectId}
                      folderKey={p.uploads.folderKey}
                      draftToken={p.uploads.purpose === "lead_reference" ? token : undefined}
                      maxFiles={10}
                      hint="PDF, DOCX, images, ZIP, video or audio"
                      onUploaded={(a) => {
                        uploadedNames.current[q.key] = [...(uploadedNames.current[q.key] ?? []), a.displayName];
                        setValue(q.key, uploadedNames.current[q.key]);
                      }}
                    />
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        {submitError ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{submitError}</p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <div className="flex items-center gap-2">
            {idx > 0 ? (
              <Button variant="ghost" icon="chevron-left" onClick={() => go(keys[idx - 1])}>Back</Button>
            ) : (
              <Link href={p.exitHref} className="inline-flex h-11 items-center px-3 text-sm font-semibold text-muted hover:text-fg">Cancel</Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={p.exitHref} className="hidden h-11 items-center px-3 text-sm font-semibold text-muted hover:text-fg sm:inline-flex" title="Your progress is saved automatically">Save &amp; exit</Link>
            {isReview ? (
              <Button type="submit" size="lg" loading={submitting} iconRight="send">{p.submitLabel ?? "Submit request"}</Button>
            ) : (
              <Button type="submit" size="lg" iconRight="arrow">{idx === total - 2 ? "Review" : "Continue"}</Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
