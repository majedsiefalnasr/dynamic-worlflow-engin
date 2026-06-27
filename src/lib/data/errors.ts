// ============================================================
// Normalized domain error. The data layer maps every backend
// failure into this one shape so the UI branches on `kind`
// (business meaning) and never on HTTP status or backend code.
// Transport details live in `meta` for diagnostics only.
// ============================================================

export type DomainErrorKind =
  | "validation"
  | "conflict"
  | "forbidden"
  | "blocked"
  | "unauthorized"
  | "network"
  | "unknown";

export interface DomainError {
  kind: DomainErrorKind;
  message: string;
  fields?: Record<string, string[]>;
  meta?: {
    status?: number;
    code?: string;
    requestId?: string;
    cause?: unknown;
  };
}

const BRAND = Symbol.for("cby.DomainError");

function make(kind: DomainErrorKind, message: string, extra: Partial<DomainError> = {}): DomainError {
  return Object.assign({ [BRAND]: true } as object, { kind, message, ...extra }) as DomainError;
}

export function isDomainError(e: unknown): e is DomainError {
  return typeof e === "object" && e !== null && (e as Record<symbol, unknown>)[BRAND] === true;
}

interface ErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
  code?: string;
  request_id?: string;
}

function readBody(body: unknown): ErrorBody {
  return typeof body === "object" && body !== null ? (body as ErrorBody) : {};
}

/** Map an HTTP failure into a DomainError. The single mapping point (spec §3.3). */
export function mapHttpError(status: number, body: unknown, contentType?: string): DomainError {
  const b = readBody(body);
  const meta = { status, code: b.code, requestId: b.request_id };
  const message = b.message || defaultMessage(status);

  // Body-level optimistic-lock signal wins regardless of wrapper status.
  if (b.code === "STALE_RESOURCE") return make("conflict", message, { meta });

  if (status === 422) return make("validation", message, { fields: b.errors, meta });
  if (status === 409) return make("conflict", message, { meta });
  if (status === 403) return make("forbidden", message, { meta });
  if (status === 401) return make("unauthorized", message, { meta });
  if (status === 406 && (contentType ?? "").includes("text/html"))
    return make("blocked", "This operation is blocked by the server.", { meta });
  if (status >= 500 && status <= 599) return make("network", message, { meta });

  return make("unknown", message, { meta });
}

export function networkError(cause: unknown): DomainError {
  return make("network", "Network request failed.", { meta: { cause } });
}

function defaultMessage(status: number): string {
  if (status === 422) return "Validation failed.";
  if (status === 409) return "This record was changed by someone else.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 401) return "Your session has expired.";
  if (status >= 500) return "The server had a problem.";
  return "Something went wrong.";
}
