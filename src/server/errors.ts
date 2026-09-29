export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "INVALID_TRANSITION"
  | "PAYMENT_REQUIRED"
  | "GATED"
  | "UNSUPPORTED"
  | "TOO_LARGE"
  | "NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  INVALID_TRANSITION: 409,
  PAYMENT_REQUIRED: 402,
  GATED: 423,
  UNSUPPORTED: 415,
  TOO_LARGE: 413,
  NOT_CONFIGURED: 501,
  INTERNAL: 500,
};

/** Every expected failure is an AppError — the API layer turns it into a consistent JSON envelope. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterSec?: number;
  constructor(code: ErrorCode, message: string, opts?: { fields?: Record<string, string>; retryAfterSec?: number }) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.fields = opts?.fields;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`);
export const forbidden = (msg = "You don't have permission to do that.") => new AppError("FORBIDDEN", msg);
export const badRequest = (msg: string, fields?: Record<string, string>) => new AppError("BAD_REQUEST", msg, { fields });
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
