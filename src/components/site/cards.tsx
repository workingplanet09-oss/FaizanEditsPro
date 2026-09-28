import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/format";

export interface ServiceCardData {
  slug: string;
  title: string;
  icon: string;
  shortDescription: string;
  useCase: string | null;
  deliverables: string[];
  turnaround: string | null;
  startingPrice: number | null;
  currency: string;
  priceLabel: string | null;
}

export function ServiceCard({ s, compact }: { s: ServiceCardData; compact?: boolean }) {
  return (
    <Link href={`/services/${s.slug}`} className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lift">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/0 blur-2xl transition duration-500 group-hover:bg-accent/25" />
      <div className="mb-5 flex items-start justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-fg transition group-hover:bg-accent group-hover:text-accent-fg">
          <Icon name={s.icon} size={22} />
        </span>
        <Icon name="arrow-up-right" size={18} className="text-subtle transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </div>
      <h3 className="text-lg font-extrabold tracking-tight">{s.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{s.shortDescription}</p>
      {!compact ? (
        <>
          {s.useCase ? <p className="mt-4 text-xs text-subtle"><span className="font-semibold text-muted">Typical use · </span>{s.useCase}</p> : null}
          {s.deliverables.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {s.deliverables.slice(0, 4).map((d) => (
                <li key={d} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="mt-auto flex items-center justify-between border-t border-line pt-4 text-xs">
        <span className="font-bold">{s.startingPrice ? `From ${formatMoney(s.startingPrice, s.currency, { compact: true })}` : s.priceLabel || "Custom quote"}</span>
        {s.turnaround ? (
          <span className="inline-flex items-center gap-1 text-subtle">
            <Icon name="clock" size={12} />
            {s.turnaround}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export interface PlanData {
  id: string;
  name: string;
  tier: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  billingType: string;
  priceNote: string | null;
  includedVideos: number | null;
  includedShorts: number | null;
  includedRevisions: number | null;
  hoursIncluded: number | null;
  turnaround: string | null;
  resolution: string | null;
  motionGraphics: boolean;
  captions: boolean;
  soundDesign: boolean;
  prioritySupport: boolean;
  dedicatedEditor: boolean;
  storageGb: number | null;
  features: string[];
  highlighted: boolean;
  ctaLabel: string | null;
}

const BILLING_LABEL: Record<string, string> = { ONE_TIME: "per project", PER_VIDEO: "per video", PER_SHORT: "per short", MONTHLY_RETAINER: "per month", HOURLY: "per hour", CUSTOM_QUOTE: "" };

export function PlanCard({ p }: { p: PlanData }) {
  const included: { on: boolean; label: string }[] = [
    { on: p.includedVideos != null, label: `${p.includedVideos} video${p.includedVideos === 1 ? "" : "s"} included` },
    { on: p.includedShorts != null, label: `${p.includedShorts} short${p.includedShorts === 1 ? "" : "s"} included` },
    { on: p.hoursIncluded != null, label: `${p.hoursIncluded} editing hours` },
    { on: p.includedRevisions != null, label: `${p.includedRevisions} revision round${p.includedRevisions === 1 ? "" : "s"}` },
    { on: !!p.turnaround, label: `${p.turnaround} turnaround` },
    { on: !!p.resolution, label: p.resolution ?? "" },
    { on: p.motionGraphics, label: "Motion graphics" },
    { on: p.captions, label: "Captions" },
    { on: p.soundDesign, label: "Sound design" },
    { on: p.prioritySupport, label: "Priority support" },
    { on: p.dedicatedEditor, label: "Dedicated editor" },
    { on: p.storageGb != null, label: `${p.storageGb} GB storage` },
    ...p.features.map((f) => ({ on: true, label: f })),
  ].filter((x) => x.on);
  const custom = p.billingType === "CUSTOM_QUOTE" || p.price == null;
  return (
    <div className={cn("relative flex h-full flex-col rounded-[var(--radius-card)] border p-7", p.highlighted ? "border-accent bg-surface shadow-[0_0_0_1px_var(--accent),0_30px_80px_-30px_color-mix(in_srgb,var(--accent)_50%,transparent)]" : "border-line bg-surface shadow-soft")}>
      {p.highlighted ? <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-accent-fg">Most popular</span> : null}
      {p.tier ? <div className="eyebrow">{p.tier}</div> : null}
      <h3 className="mt-1 text-2xl font-extrabold tracking-tight">{p.name}</h3>
      {p.description ? <p className="mt-2 min-h-10 text-sm text-muted">{p.description}</p> : null}
      <div className="mt-6 flex items-baseline gap-2">
        {custom ? (
          <span className="text-4xl font-extrabold tracking-tight">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">{formatMoney(p.price, p.currency, { compact: true })}</span>
            <span className="text-sm text-muted">{p.priceNote || BILLING_LABEL[p.billingType]}</span>
          </>
        )}
      </div>
      <div className="mt-1 text-xs text-subtle">{titleCase(p.billingType.toLowerCase())}</div>
      <ul className="mt-6 space-y-3 border-t border-line pt-6 text-sm">
        {included.map((i) => (
          <li key={i.label} className="flex gap-3">
            <Icon name="check-circle" size={17} className="mt-px shrink-0 text-accent" />
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <ButtonLink href={`/start-project?plan=${encodeURIComponent(p.name)}`} variant={p.highlighted ? "primary" : "outline"} className="w-full">
          {p.ctaLabel || (custom ? "Request a quote" : "Get started")}
        </ButtonLink>
      </div>
    </div>
  );
}

export function TestimonialCard({ t }: { t: { name: string; role: string | null; company: string | null; quote: string; rating: number; imageUrl: string | null } }) {
  return (
    <figure className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft">
      <div className="flex gap-0.5 text-accent" aria-label={`${t.rating} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={16} className={i < t.rating ? "fill-current" : "opacity-25"} />
        ))}
      </div>
      <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed">“{t.quote}”</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        {t.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-sm font-bold">
            {t.name.charAt(0)}
          </span>
        )}
        <span className="text-sm">
          <span className="block font-bold">{t.name}</span>
          <span className="block text-xs text-muted">{[t.role, t.company].filter(Boolean).join(" · ")}</span>
        </span>
      </figcaption>
    </figure>
  );
}
