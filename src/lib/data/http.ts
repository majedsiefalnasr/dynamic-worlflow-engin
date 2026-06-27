// ============================================================
// One thin fetch wrapper for the live backend. Prefixes the base
// URL, attaches the Sanctum bearer token + cookie, unwraps the
// `{success,message,data}` / `{data,meta}` envelopes, and turns
// every failure into a DomainError via mapHttpError/networkError.
// Resource adapters use this; screens never touch it (spec §2).
// ============================================================

import { mapHttpError, networkError, type DomainError } from "./errors";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN_KEY = "cby:token";

function read(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
let token: string | null = read();

export const tokenStore = {
  get: () => token,
  set: (t: string | null) => {
    token = t;
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    token = null;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* */
    }
  },
};

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

type Query = Record<string, string | number | boolean | null | undefined>;
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(
  method: Method,
  path: string,
  opts: { body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: "include",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }

  const body = await parse(res);
  if (!res.ok) {
    if (res.status === 401) {
      tokenStore.clear();
      // Dynamic import to avoid circular dep (auth imports http, http can't import auth)
      import("@/lib/mock").then((m) => m.auth.logout()).catch(() => {});
    }
    throw mapHttpError(res.status, body, res.headers.get("content-type") ?? undefined);
  }
  return body;
}

/** Unwrap `{success,message,data}` or `{data}` to the inner data. */
function unwrap(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: unknown }).data;
  }
  return body;
}

export const api = {
  get: async <T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> =>
    unwrap(await request("GET", path, { query, signal })) as T,

  getList: async <T>(
    path: string,
    query?: Query,
    signal?: AbortSignal,
  ): Promise<{ data: T[]; meta?: PageMeta }> => {
    const body = await request("GET", path, { query, signal });
    const data = (unwrap(body) ?? []) as T[];
    const meta = (body as { meta?: PageMeta } | null)?.meta;
    return { data: Array.isArray(data) ? data : [], meta };
  },

  post: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap(await request("POST", path, { body })) as T,

  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap(await request("PATCH", path, { body })) as T,

  del: async <T>(path: string): Promise<T> => unwrap(await request("DELETE", path)) as T,
};

export type { DomainError };
