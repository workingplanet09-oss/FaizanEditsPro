import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors";
import { actorFromToken, type Actor } from "../auth/actor";
import { CSRF_COOKIE, SESSION_COOKIE, csrfFor } from "../auth/session";
import { safeEqual } from "../auth/crypto";
import { rateLimit } from "../security/ratelimit";
import { clientIp, isSameOrigin, userAgent } from "../security/request";
import { runWithRequest } from "../request-context";

export interface RateLimitOpt {
  name: string;
  limit: number;
  windowSec: number;
  by?: "ip" | "user";
}

interface BaseOpts<B, Q> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  rateLimit?: RateLimitOpt;
  /** default 200; use 201 for creates */
  status?: number;
  /** set false for webhooks / signature-verified endpoints */
  csrf?: boolean;
}

export interface AuthCtx<B, Q> {
  req: NextRequest;
  actor: Actor;
  body: B;
  query: Q;
  params: Record<string, string>;
  ip: string;
}
export interface PublicCtx<B, Q> extends Omit<AuthCtx<B, Q>, "actor"> {
  actor: Actor | null;
}

type RouteContext = { params: Promise<Record<string, string>> };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Largest JSON body any handler accepts (the biggest legitimate one is a drawn signature, ~200 KB). Files never pass through here — they go straight to storage. */
const MAX_JSON_BYTES = 1_000_000;

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  const body = JSON.stringify({ ok: true, data }, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const responseInit = typeof init === "number" ? { status: init } : init;
  return new NextResponse(body, { ...responseInit, headers: { "content-type": "application/json", "cache-control": "no-store", ...(responseInit?.headers ?? {}) } });
}

export function errorResponse(e: unknown): NextResponse {
  let status = 500;
  let code = "INTERNAL";
  let message = "Something went wrong on our side. Please try again.";
  let fields: Record<string, string> | undefined;
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };

  if (e instanceof AppError) {
    status = e.status;
    code = e.code;
    message = e.message;
    fields = e.fields;
    if (e.retryAfterSec) headers["retry-after"] = String(e.retryAfterSec);
  } else if (e instanceof ZodError) {
    status = 422;
    code = "VALIDATION";
    message = "Please check the highlighted fields.";
    fields = {};
    for (const issue of e.issues) fields[issue.path.join(".") || "_"] = issue.message;
  } else if ((e as any)?.code === "P2002") {
    status = 409;
    code = "CONFLICT";
    message = "That already exists.";
  } else if ((e as any)?.code === "P2025") {
    status = 404;
    code = "NOT_FOUND";
    message = "Not found.";
  } else {
    console.error("[api] unhandled error", e);
  }
  return new NextResponse(JSON.stringify({ ok: false, error: { code, message, ...(fields ? { fields } : {}) } }), { status, headers });
}

async function parse<T>(schema: ZodType<T> | undefined, value: unknown): Promise<T> {
  if (!schema) return value as T;
  return schema.parseAsync(value);
}

async function execute<B, Q>(
  req: NextRequest,
  routeCtx: RouteContext | undefined,
  opts: BaseOpts<B, Q>,
  mode: "auth" | "public",
  fn: (c: any) => Promise<unknown>,
): Promise<Response> {
  const ip = clientIp(req);
  return runWithRequest({ ip, userAgent: userAgent(req) }, async () => {
    try {
      const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
      const actor = await actorFromToken(token);
      if (mode === "auth" && !actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");

      const mutating = MUTATING.has(req.method);
      if (mutating && opts.csrf !== false) {
        if (!isSameOrigin(req)) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
        // Any request that rides on a session cookie must prove intent with the double-submit token.
        if (actor) {
          const sent = req.headers.get("x-csrf-token") ?? "";
          if (!sent || !safeEqual(sent, csrfFor(actor.sessionHash))) throw new AppError("FORBIDDEN", "Security token missing or expired. Refresh the page and try again.");
        }
      }

      if (opts.rateLimit) {
        const r = opts.rateLimit;
        const who = r.by === "user" && actor ? actor.userId : ip;
        rateLimit(`${r.name}:${who}`, r.limit, r.windowSec * 1000);
      }

      const params = routeCtx?.params ? await routeCtx.params : {};
      const query = await parse(opts.query, Object.fromEntries(req.nextUrl.searchParams));
      let body: unknown = undefined;
      if (opts.body) {
        const declared = Number(req.headers.get("content-length") ?? 0);
        if (declared > MAX_JSON_BYTES) throw new AppError("TOO_LARGE", "That request is too large.");
        let raw: unknown;
        try {
          const text = await req.text();
          if (text.length > MAX_JSON_BYTES) throw new AppError("TOO_LARGE", "That request is too large.");
          raw = JSON.parse(text);
        } catch (e) {
          if (e instanceof AppError) throw e;
          throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
        }
        body = await parse(opts.body, raw);
      }

      const result = await fn({ req, actor, body, query, params, ip });
      if (result instanceof Response) return result;
      return json(result ?? { done: true }, opts.status ?? 200);
    } catch (e) {
      return errorResponse(e);
    }
  });
}

/** Signed-in only. `ctx.actor` is guaranteed. Authorization (permissions + ownership) happens inside the service. */
export function authRoute<B = undefined, Q = Record<string, string>>(opts: BaseOpts<B, Q>, fn: (c: AuthCtx<B, Q>) => Promise<unknown>) {
  return (req: NextRequest, routeCtx?: RouteContext) => execute(req, routeCtx, opts, "auth", fn);
}

/** Open endpoint (lead forms, webhooks, login). `ctx.actor` is set if a valid session cookie is present. */
export function publicRoute<B = undefined, Q = Record<string, string>>(opts: BaseOpts<B, Q>, fn: (c: PublicCtx<B, Q>) => Promise<unknown>) {
  return (req: NextRequest, routeCtx?: RouteContext) => execute(req, routeCtx, opts, "public", fn);
}

export { CSRF_COOKIE };
