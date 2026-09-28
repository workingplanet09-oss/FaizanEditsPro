"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

const base =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(base, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(base, "min-h-28 py-3 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} aria-invalid={invalid || undefined} className={cn(base, "h-11 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
    </div>
  );
});

/** Label + control + hint/error, wired with aria-describedby. `children` receives ids to apply to the control. */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  tooltip,
}: {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  children: (p: { id: string; "aria-describedby"?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
  tooltip?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold">
          <span>{label}</span>
          {required ? (
            <span className="text-danger" aria-hidden title="Required">
              *
            </span>
          ) : (
            <span className="text-xs font-normal text-subtle">optional</span>
          )}
          {required ? <span className="sr-only">(required)</span> : null}
          {tooltip ? (
            <span className="group relative inline-flex">
              <button type="button" aria-label={`About ${typeof label === "string" ? label : "this field"}`} className="text-subtle hover:text-fg">
                <Icon name="help" size={14} />
              </button>
              <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-56 -translate-x-1/2 rounded-lg bg-fg px-3 py-2 text-xs font-normal leading-snug text-bg shadow-lift group-hover:block group-focus-within:block">
                {tooltip}
              </span>
            </span>
          ) : null}
        </label>
      ) : null}
      {children({ id, "aria-describedby": describedBy, invalid: !!error })}
      {error ? (
        <p id={`${id}-err`} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <Icon name="alert" size={13} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl p-2 -m-2 hover:bg-surface-2/60", className)}>
      <input type="checkbox" className="peer mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface transition checked:border-accent checked:bg-accent focus-visible:ring-4 focus-visible:ring-accent/25" {...rest} />
      <Icon name="check" size={13} strokeWidth={3} className="pointer-events-none absolute ml-[2.5px] mt-[5px] hidden text-accent-fg peer-checked:block" />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-center justify-between gap-4">
      {label ? (
        <label htmlFor={sid} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-semibold leading-snug">{label}</span>
          {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
        </label>
      ) : null}
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50", checked ? "bg-accent" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/** Radio cards / chips used by wizards. Keyboard accessible (real radios / checkboxes underneath). */
export function ChoiceGroup({
  name,
  options,
  value,
  onChange,
  multiple,
  variant = "chips",
  invalid,
  ariaLabel,
}: {
  name: string;
  options: { value: string; label: string; icon?: string | null; description?: string | null }[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  multiple?: boolean;
  variant?: "chips" | "cards";
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (v: string) => {
    if (!multiple) return onChange(v);
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={ariaLabel} className={cn(variant === "cards" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-wrap gap-2", invalid && "rounded-xl ring-2 ring-danger/40 p-1")}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "group relative cursor-pointer select-none transition duration-200",
              variant === "cards" ? "flex items-start gap-3 rounded-2xl border p-4 hover:-translate-y-px hover:shadow-soft" : "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
              on ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)_inset]" : "border-line-strong bg-surface hover:border-subtle",
            )}
          >
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} checked={on} onChange={() => toggle(o.value)} className="peer sr-only" />
            <span className="absolute inset-0 rounded-[inherit] peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30" aria-hidden />
            {variant === "cards" && o.icon ? (
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
                <Icon name={o.icon} size={20} />
              </span>
            ) : null}
            <span className="min-w-0">
              <span className={cn("block font-semibold", variant === "cards" ? "text-[15px]" : "text-sm")}>{o.label}</span>
              {variant === "cards" && o.description ? <span className="mt-0.5 block text-xs text-muted">{o.description}</span> : null}
            </span>
            {on ? <Icon name="check-circle" size={16} className={cn("text-fg", variant === "cards" ? "ml-auto shrink-0" : "")} /> : null}
          </label>
        );
      })}
    </div>
  );
}
