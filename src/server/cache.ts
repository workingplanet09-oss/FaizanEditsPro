/** Tiny in-process TTL cache with prefix invalidation, for public CMS reads. Swap for Redis when scaling out. */
interface Entry {
  at: number;
  value: unknown;
}
const g = globalThis as unknown as { __cache?: Map<string, Entry>; __inflight?: Map<string, Promise<unknown>> };
const store = (g.__cache ??= new Map<string, Entry>());
const inflight = (g.__inflight ??= new Map<string, Promise<unknown>>());

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function invalidate(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
