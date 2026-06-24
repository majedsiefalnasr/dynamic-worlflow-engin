// ============================================================
// Backend API client (Yemen Flow Hub API).
//
// One thin fetch wrapper used by every resource module. It:
//  - prefixes VITE_API_BASE_URL,
//  - attaches the in-memory access token + Sanctum cookie,
//  - unwraps the `{ success, message, data }` / `{ data, meta }` envelopes,
//  - turns `{ success:false, message, errors }` into a typed `ApiError`.
//
// When VITE_API_BASE_URL is empty the app stays on local mock data, so
// `isApiEnabled()` gates every migrated screen.
// ============================================================

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// Per-resource opt-in: comma list of migrated resources, or `*` for all.
// Lets one screen go live against the backend while the rest stay on mock.
const API_RESOURCES = new Set(
  (import.meta.env.VITE_API_RESOURCES ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

/** True when a backend base URL is configured (auth/login switch to live). */
export const hasApiBase = (): boolean => BASE_URL.length > 0;

/**
 * True when a given resource should use the live backend. With no argument it
 * reports only whether a base URL exists. A screen passes its resource key so
 * it stays on mock until that key is listed in VITE_API_RESOURCES (or `*`).
 */
export const isApiEnabled = (resource?: string): boolean => {
  if (!BASE_URL) return false;
  if (!resource) return true;
  return API_RESOURCES.has("*") || API_RESOURCES.has(resource);
};

// ---------- Access token (in memory only, never localStorage — see 09) ----------

let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};

// ---------- Error type ----------

export class ApiError extends Error {
  status: number;
  /** Machine-readable business code when the backend sends one (see BE-02). */
  code?: string;
  /** Field validation map from a 422 response. */
  fields?: Record<string, string[]>;
  requestId?: string;

  constructor(status: number, message: string, extra?: Partial<ApiError>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.assign(this, extra);
  }
}

// ---------- Request core ----------

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Pulls the resource payload out of whichever success envelope the backend used. */
function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function toApiError(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    return new ApiError(status, typeof p.message === "string" ? p.message : `HTTP ${status}`, {
      code: typeof p.code === "string" ? p.code : undefined,
      fields: (p.errors ?? p.fields) as Record<string, string[]> | undefined,
      requestId: typeof p.request_id === "string" ? p.request_id : undefined,
    });
  }
  return new ApiError(status, `HTTP ${status}`);
}

async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const { method = "GET", body, query, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: "include", // Sanctum cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const payload = await parseJson(res);
  if (!res.ok) throw toApiError(res.status, payload);
  return payload;
}

// ---------- Public verbs ----------

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request(path, { query, signal }).then(unwrap) as Promise<T>,

  /** GET a paginated list; returns the resource array plus pagination meta. */
  getList: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request(path, { query, signal }).then((payload) => {
      const root = (payload && typeof payload === "object" ? payload : {}) as Record<
        string,
        unknown
      >;
      const inner = (root.data && typeof root.data === "object" ? root.data : root) as Record<
        string,
        unknown
      >;
      const data = (Array.isArray(root.data) ? root.data : (inner.data ?? [])) as T[];
      const meta = (root.meta ?? inner.meta) as PageMeta | undefined;
      return { data, meta };
    }),

  post: <T>(path: string, body?: unknown) =>
    request(path, { method: "POST", body }).then(unwrap) as Promise<T>,
  patch: <T>(path: string, body?: unknown) =>
    request(path, { method: "PATCH", body }).then(unwrap) as Promise<T>,
  put: <T>(path: string, body?: unknown) =>
    request(path, { method: "PUT", body }).then(unwrap) as Promise<T>,
  del: <T>(path: string, body?: unknown) =>
    request(path, { method: "DELETE", body }).then(unwrap) as Promise<T>,
};
