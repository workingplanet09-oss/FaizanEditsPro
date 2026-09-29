import { cookies } from "next/headers";
import { forbidden as nextForbidden, notFound as nextNotFound, redirect } from "next/navigation";
import { AppError } from "./errors";
import { greeting } from "@/lib/format";

/**
 * Runs a service call from a Server Component and maps expected failures onto Next's own pages:
 * NOT_FOUND → 404 (also what out-of-scope rows produce, so ids can't be probed), FORBIDDEN → 403, UNAUTHENTICATED → /login.
 */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "NOT_FOUND") nextNotFound();
      if (e.code === "FORBIDDEN") nextForbidden();
      if (e.code === "UNAUTHENTICATED") redirect("/login");
    }
    throw e;
  }
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const num = (v: string | string[] | undefined, d = 1) => {
  const n = Number(first(v));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

/** Greeting for the viewer's local time of day. The browser stores its time zone in the `fe_tz` cookie (see the inline script in the root layout). */
export async function viewerGreeting(): Promise<string> {
  const tz = (await cookies()).get("fe_tz")?.value;
  if (!tz) return greeting();
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: decodeURIComponent(tz) }).format(new Date()));
    return greeting(Number.isFinite(hour) ? hour : undefined);
  } catch {
    return greeting(); // unknown/invalid zone name
  }
}
