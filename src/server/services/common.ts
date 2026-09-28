import { db, type Tx } from "../db";

/** Atomic per-workspace sequence: nextNumber(ws, "invoice", 1000) → 1001, 1002, … */
export async function nextNumber(workspaceId: string, key: string, start = 1000, tx: Tx | typeof db = db): Promise<number> {
  const row = await tx.counter.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, value: start + 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export interface PageInput {
  page?: number | string | null;
  pageSize?: number | string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function pageArgs(input: PageInput, defaultSize = 20, max = 100) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(max, Math.max(1, Number(input.pageSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

/** Business-day arithmetic (Mon–Fri) for turnaround → deadline. */
export function addBusinessDays(d: Date, n: number): Date {
  const x = new Date(d);
  let left = n;
  while (left > 0) {
    x.setDate(x.getDate() + 1);
    const day = x.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return x;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** Convert BigInt (asset sizes) → number for JSON/RSC boundaries. */
export const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
