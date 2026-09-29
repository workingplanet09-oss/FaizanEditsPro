"use client";

import { Field, Input, Select, Textarea, ChoiceGroup, Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { QuestionDef } from "@/lib/conditions";

/** Renders ONE database-defined question according to its type. Purely presentational; validation lives in the wizard. */
export function QuestionField({ q, value, error, onChange, files }: { q: QuestionDef; value: any; error?: string | null; onChange: (v: any) => void; files?: React.ReactNode }) {
  const opts = q.options.map((o) => ({ value: o.value, label: o.label, icon: o.icon, description: o.description }));
  const display = q.meta?.display as string | undefined;
  const common = { label: q.text, required: q.required, hint: q.helpText ?? undefined, error: error ?? undefined };

  switch (q.type) {
    case "RADIO":
      return (
        <Field {...common}>
          {(p) => (
            <div id={p.id} aria-describedby={p["aria-describedby"]}>
              <ChoiceGroup name={q.key} options={opts} value={value} onChange={onChange} variant={display === "cards" ? "cards" : "chips"} invalid={p.invalid} ariaLabel={q.text} />
            </div>
          )}
        </Field>
      );
    case "MULTI_SELECT":
      return (
        <Field {...common}>
          {(p) => (
            <div id={p.id}>
              <ChoiceGroup name={q.key} options={opts} value={value ?? []} onChange={onChange} multiple variant={display === "cards" ? "cards" : "chips"} invalid={p.invalid} ariaLabel={q.text} />
            </div>
          )}
        </Field>
      );
    case "SELECT":
      return (
        <Field {...common}>
          {(p) => (
            <Select {...p} name={q.key} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
              <option value="">Select…</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    case "TEXTAREA":
      return (
        <Field {...common}>
          {(p) => (
            <div>
              <Textarea {...p} name={q.key} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder ?? undefined} rows={q.key === "project_description" ? 7 : 4} maxLength={q.meta?.maxLength ?? 8000} />
              {q.meta?.minLength ? <div className={cn("mt-1 text-right text-[11px]", (value?.length ?? 0) >= q.meta.minLength ? "text-success" : "text-subtle")}>{value?.length ?? 0} / {q.meta.minLength}+ characters</div> : null}
            </div>
          )}
        </Field>
      );
    case "CHECKBOX":
      return (
        <div className="space-y-1.5">
          <Checkbox label={q.text} description={q.helpText ?? undefined} checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {error ? <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger"><Icon name="alert" size={13} />{error}</p> : null}
        </div>
      );
    case "COLOR":
      return (
        <Field {...common}>
          {(p) => (
            <div className="flex items-center gap-3">
              <input type="color" aria-label={`${q.text} colour picker`} value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#ff5b2e"} onChange={(e) => onChange(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" />
              <Input {...p} name={q.key} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="#FF5B2E" className="max-w-40 font-mono" />
            </div>
          )}
        </Field>
      );
    case "RATING":
      return (
        <Field {...common}>
          {() => (
            <div className="flex gap-1" role="radiogroup" aria-label={q.text}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={Number(value) === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="rounded-lg p-1 text-accent-text transition hover:scale-110">
                  <Icon name="star" size={28} className={Number(value) >= n ? "fill-current" : "opacity-30"} />
                </button>
              ))}
            </div>
          )}
        </Field>
      );
    case "FILE":
      return (
        <Field {...common}>
          {() => <div>{files}</div>}
        </Field>
      );
    default: {
      const type = q.type === "EMAIL" ? "email" : q.type === "URL" ? "url" : q.type === "PHONE" ? "tel" : q.type === "NUMBER" || q.type === "CURRENCY" ? "number" : q.type === "DATE" ? "date" : q.type === "TIME" ? "time" : "text";
      const auto = q.key === "name" ? "name" : q.key === "email" ? "email" : q.key === "phone" ? "tel" : q.key === "company" ? "organization" : q.key === "website" ? "url" : undefined;
      return (
        <Field {...common}>
          {(p) => (
            <Input
              {...p}
              name={q.key}
              type={type}
              inputMode={type === "number" ? "decimal" : undefined}
              min={q.meta?.min}
              max={q.meta?.max}
              autoComplete={auto}
              value={value ?? ""}
              onChange={(e) => onChange(type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
              placeholder={q.placeholder ?? undefined}
            />
          )}
        </Field>
      );
    }
  }
}
