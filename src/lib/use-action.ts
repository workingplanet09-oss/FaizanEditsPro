"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "./api-client";

/**
 * Wraps an async mutation with loading + error state, field errors and a router refresh so every server
 * component on the page re-reads the database. Prevents double-submits.
 */
export function useAction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>, opts: { refresh?: boolean; onSuccess?: (r: TResult) => void; onError?: (e: ApiError) => void } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const busy = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      setError(null);
      setFields({});
      try {
        const r = await fn(...args);
        opts.onSuccess?.(r);
        if (opts.refresh !== false) router.refresh();
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, "ERROR", (e as Error)?.message ?? "Something went wrong.");
        setError(err.message);
        setFields(err.fields ?? {});
        opts.onError?.(err);
        return undefined;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, router],
  );

  return { run, pending, error, fields, clear: () => (setError(null), setFields({})) };
}
