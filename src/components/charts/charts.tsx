import { cn } from "@/lib/cn";

/**
 * Small dependency-free SVG charts. Everything is rendered from real data passed in; when there is none the caller
 * shows <ChartEmpty/> ("No data available yet.") instead of a fake shape. Each chart exposes its numbers to
 * assistive tech through a visually hidden table.
 */
export interface Point {
  label: string;
  value: number;
}

const PALETTE = ["var(--accent)", "var(--fg)", "var(--info)", "var(--success)", "var(--warning)", "#8b5cf6", "#14b8a6", "var(--subtle)"];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];

export function ChartEmpty({ text = "No data available yet." }: { text?: string }) {
  return <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-subtle">{text}</div>;
}

function A11yTable({ caption, data, format }: { caption: string; data: Point[]; format: (n: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
    </table>
  );
}

/** "2026-09" → "Sep" (with the year on January and the first bar); anything else is left alone. */
const shortLabel = (label: string, i: number) => {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return label.length > 10 ? label.slice(0, 9) + "…" : label;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const mon = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return i === 0 || m[2] === "01" ? `${mon} '${m[1].slice(2)}` : mon;
};

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function BarChart({ data, format = (n) => String(n), label, height = 200 }: { data: Point[]; format?: (n: number) => string; label: string; height?: number }) {
  if (!data.length || data.every((d) => d.value === 0)) return <ChartEmpty />;
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const bw = (W - pad.l - pad.r) / data.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" preserveAspectRatio="none">
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - g)} y2={pad.t + (H - pad.t - pad.b) * (1 - g)} stroke="var(--line)" strokeDasharray={g ? "3 4" : undefined} />
        ))}
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.value) / max;
          const x = pad.l + i * bw + bw * 0.18;
          return (
            <g key={d.label}>
              <rect x={x} y={H - pad.b - h} width={bw * 0.64} height={Math.max(h, d.value ? 2 : 0)} rx={4} fill="var(--accent)" opacity={0.92}>
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
              <text x={x + (bw * 0.64) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--subtle)">{shortLabel(d.label, i)}</text>
            </g>
          );
        })}
      </svg>
      <A11yTable caption={label} data={data} format={format} />
    </div>
  );
}

export function LineChart({ data, format = (n) => String(n), label, height = 180, color = "var(--accent)" }: { data: Point[]; format?: (n: number) => string; label: string; height?: number; color?: string }) {
  if (data.length < 2 || data.every((d) => d.value === 0)) return <ChartEmpty />;
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (data.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const id = `g${label.replace(/\W/g, "").slice(0, 12)}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" preserveAspectRatio="none">
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map((g) => <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - g)} y2={pad.t + (H - pad.t - pad.b) * (1 - g)} stroke="var(--line)" strokeDasharray={g ? "3 4" : undefined} />)}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="var(--surface)" stroke={color} strokeWidth="2"><title>{`${d.label}: ${format(d.value)}`}</title></circle>
            {i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--subtle)">{shortLabel(d.label, i)}</text> : null}
          </g>
        ))}
      </svg>
      <A11yTable caption={label} data={data} format={format} />
    </div>
  );
}

export function HBar({ data, format = (n) => String(n), label, max: fixedMax }: { data: Point[]; format?: (n: number) => string; label: string; max?: number }) {
  if (!data.length) return <ChartEmpty />;
  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <ul className="space-y-2.5" aria-label={label}>
        {data.map((d, i) => (
          <li key={d.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-medium">{d.label}</span><span className="shrink-0 tabular-nums text-muted">{format(d.value)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: seriesColor(i) }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Donut({ data, label, center }: { data: Point[]; label: string; center?: React.ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <ChartEmpty />;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" role="img" aria-label={label} className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
          {data.map((d, i) => {
            const len = (d.value / total) * C;
            const el = <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={seriesColor(i)} strokeWidth="16" strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-acc}><title>{`${d.label}: ${d.value}`}</title></circle>;
            acc += len;
            return el;
          })}
        </svg>
        {center ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div> : null}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: seriesColor(i) }} /><span className="truncate">{d.label}</span><span className="ml-auto tabular-nums text-muted">{d.value}</span></li>)}
      </ul>
    </div>
  );
}

export function ChartCard({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft", className)}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-extrabold leading-tight">{title}</h3>{subtitle ? <p className="mt-0.5 text-xs text-subtle">{subtitle}</p> : null}</div>{action}</div>
      {children}
    </section>
  );
}
