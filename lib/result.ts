/**
 * Error primitives.
 *
 * `AppError` is the one error type handlers throw for expected, user-facing
 * failures. It carries a stable machine `code`, a safe human `message`, and an
 * HTTP `status`. `toApiError()` is the only thing that ever crosses the wire —
 * it strips stack traces, internal causes, and status so handlers can never leak
 * internals to a client.
 */

/** Stable, client-safe error codes. Extend as phases need them. */
export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "READ_ONLY"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  READ_ONLY: 423,
  INTERNAL: 500,
};

/** The only shape that should ever be serialized to a client. */
export interface ApiError {
  code: AppErrorCode;
  message: string;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    // Restore the prototype chain for reliable `instanceof` after transpilation.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Strip everything except the client-safe `{ code, message }`. */
  toApiError(): ApiError {
    return { code: this.code, message: this.message };
  }

  static badRequest(message = "Bad request"): AppError {
    return new AppError("BAD_REQUEST", message);
  }
  static unauthorized(message = "Authentication required"): AppError {
    return new AppError("UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have access to this resource"): AppError {
    return new AppError("FORBIDDEN", message);
  }
  static notFound(message = "Not found"): AppError {
    return new AppError("NOT_FOUND", message);
  }
  static conflict(message = "Conflict"): AppError {
    return new AppError("CONFLICT", message);
  }
  static rateLimited(message = "Too many requests"): AppError {
    return new AppError("RATE_LIMITED", message);
  }
  static readOnly(message = "This resource is read-only"): AppError {
    return new AppError("READ_ONLY", message);
  }
  static internal(message = "Internal server error"): AppError {
    return new AppError("INTERNAL", message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Convert any thrown value into a client-safe `ApiError`. Known `AppError`s pass
 * their code/message through; anything else collapses to a generic 500 so raw
 * errors and stack traces never reach the client.
 */
export function toApiError(err: unknown): ApiError {
  if (isAppError(err)) return err.toApiError();
  return { code: "INTERNAL", message: "Internal server error" };
}

/** HTTP status for any thrown value (defaults to 500 for non-`AppError`s). */
export function statusFor(err: unknown): number {
  return isAppError(err) ? err.status : 500;
}
