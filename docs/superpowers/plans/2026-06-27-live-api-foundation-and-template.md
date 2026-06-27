# Live API Adapter Layer — Foundation + Template Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared data-layer foundation (HTTP client, DomainError mapping, resource switch, query-key convention, Vitest) and wire the first resource (reference-data) end-to-end through it, proving the adapter architecture before the other 11 resources replicate it.

**Architecture:** A per-resource adapter layer in `src/lib/data/` makes the mock-vs-live decision once, behind a stable contract: async-shaped reads (`ReadResult<T>`), Promise-based mutations returning the entity, and a normalized `DomainError`. Screens import only a resource's hook surface and never know the source. React Query, fetch, DTO mapping, and the env switch are all data-layer implementation details.

**Tech Stack:** React 19, TanStack Router + Query (already installed + wired), Vite 7, bun, TypeScript, Vitest (added here), eslint.

## Global Constraints

- **No UI/UX/functionality change.** Any required UI change goes to `docs/backend-handoff/UI-CHANGES.md` and blocks until approved — never shipped inline. (spec §1, §8)
- **Screens never branch on source.** No `apiEnabled`, env reads, HTTP status, React Query objects, or DTOs in `src/routes/` or `src/components/`. (spec §2, §3)
- **UI branches on `error.kind` only**, never `status === 409` / `code === "STALE_RESOURCE"`. (spec §3.3)
- **Adapter independence:** no resource adapter imports/calls another. Shared logic lives in `http.ts`/`errors.ts`/`query.ts`/`source.ts` or shared mappers — never a peer module. (spec §3.5)
- **Query keys only via the per-resource factory**, following root→lists→list→details→detail; invalidate at the narrowest correct level. (spec §3.6)
- **New data layer lives in `src/lib/data/`** (not `src/lib/api/`, to distinguish from the abandoned `live` branch). (spec §2)
- **Mock stays the default.** No `VITE_API_BASE_URL` ⇒ unchanged mock behavior. Per-resource opt-in via `VITE_API_RESOURCES` (or `*`). (spec §4)
- **Backend base:** `https://cby2.ultimate-dev2.com`, base path `/api/v1`, Sanctum (cookie + bearer). Local dev reaches it via the existing Vite proxy (`/api` → backend), so `VITE_API_BASE_URL=/api/v1`. (spec §1)
- **Build gates after every task:** `bun run lint`, `bunx tsc --noEmit`, `bun run build` all pass. Vitest tests pass where they exist.
- **Admin creds for live smoke:** `admin@cby.gov.ye / Password@123`.

---

## File Structure

**Foundation (shared utils — Tasks 0–4):**
- `src/lib/data/errors.ts` — `DomainError` type, `mapHttpError()`, `isDomainError()`.
- `src/lib/data/http.ts` — fetch wrapper, token store, envelope unwrap, calls `mapHttpError`.
- `src/lib/data/source.ts` — `source(resource)` switch, `hasApiBase()`, fail-fast on unknown names.
- `src/lib/data/query.ts` — shared `QueryClient` config (retry rules by `kind`), `ReadResult<T>` + `MutationHandle` types, `makeKeys` doc/helper.
- `vitest.config.ts` + `package.json` test script — test runner.

**Template resource (Task 5):**
- `src/lib/data/reference-data.ts` — `useReferenceTables`, `useReferenceMutations`, `referenceKeys`, mock+live adapters, `toReferenceTable` mapper.
- `src/routes/admin.reference-data.tsx` — modify to consume the two hooks only.

**Handoff docs (Task 6):**
- `docs/backend-handoff/UI-CHANGES.md`, `docs/backend-handoff/BACKEND-HANDOFF.md` — created (seeded with reference-data findings).

---

### Task 0: Add Vitest test runner

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script + devDeps)
- Test: `src/lib/data/__smoke__.test.ts` (throwaway, deleted in step 6)

**Interfaces:**
- Consumes: nothing.
- Produces: a working `bun run test` command; `vitest` importable in `*.test.ts`.

- [ ] **Step 1: Add Vitest dep**

```bash
bun add -d vitest@^2
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test to prove the runner works**

`src/lib/data/__smoke__.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run it**

Run: `bun run test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/lib/data/__smoke__.test.ts
git add vitest.config.ts package.json bun.lock
git commit -m "chore(test): add vitest runner for data-layer contract tests"
```

---

### Task 1: DomainError type + mapHttpError

**Files:**
- Create: `src/lib/data/errors.ts`
- Test: `src/lib/data/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DomainError = { kind: DomainErrorKind; message: string; fields?: Record<string,string[]>; meta?: { status?: number; code?: string; requestId?: string; cause?: unknown } }`
  - `type DomainErrorKind = "validation" | "conflict" | "forbidden" | "blocked" | "unauthorized" | "network" | "unknown"`
  - `function mapHttpError(status: number, body: unknown, contentType?: string): DomainError`
  - `function networkError(cause: unknown): DomainError`
  - `function isDomainError(e: unknown): e is DomainError`

- [ ] **Step 1: Write the failing test**

`src/lib/data/errors.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mapHttpError, networkError, isDomainError } from "./errors";

describe("mapHttpError", () => {
  test("422 with errors map → validation + fields", () => {
    const e = mapHttpError(422, { message: "Invalid", errors: { name: ["required"] } });
    expect(e.kind).toBe("validation");
    expect(e.fields).toEqual({ name: ["required"] });
    expect(e.message).toBe("Invalid");
  });

  test("409 → conflict", () => {
    expect(mapHttpError(409, { message: "stale" }).kind).toBe("conflict");
  });

  test("body code STALE_RESOURCE → conflict even if status 200-ish wrapper", () => {
    expect(mapHttpError(400, { code: "STALE_RESOURCE", message: "x" }).kind).toBe("conflict");
  });

  test("403 → forbidden", () => {
    expect(mapHttpError(403, { message: "no" }).kind).toBe("forbidden");
  });

  test("406 text/html (WAF) → blocked", () => {
    expect(mapHttpError(406, "<html>blocked</html>", "text/html").kind).toBe("blocked");
  });

  test("401 → unauthorized", () => {
    expect(mapHttpError(401, { message: "expired" }).kind).toBe("unauthorized");
  });

  test("500 → network", () => {
    expect(mapHttpError(500, { message: "boom" }).kind).toBe("network");
  });

  test("teapot 418 → unknown, never leaks raw body to message blindly", () => {
    const e = mapHttpError(418, { weird: true });
    expect(e.kind).toBe("unknown");
    expect(typeof e.message).toBe("string");
  });

  test("preserves diagnostics in meta, never in kind logic", () => {
    const e = mapHttpError(409, { message: "x", code: "STALE_RESOURCE", request_id: "req-1" });
    expect(e.meta?.status).toBe(409);
    expect(e.meta?.code).toBe("STALE_RESOURCE");
    expect(e.meta?.requestId).toBe("req-1");
  });
});

describe("networkError / isDomainError", () => {
  test("networkError → kind network with cause", () => {
    const e = networkError(new Error("fetch failed"));
    expect(e.kind).toBe("network");
    expect(e.meta?.cause).toBeInstanceOf(Error);
  });

  test("isDomainError true for mapped, false for plain Error", () => {
    expect(isDomainError(mapHttpError(403, {}))).toBe(true);
    expect(isDomainError(new Error("x"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/data/errors.test.ts`
Expected: FAIL — cannot resolve `./errors`.

- [ ] **Step 3: Write `src/lib/data/errors.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/data/errors.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Build gates + commit**

```bash
bunx tsc --noEmit && bun run lint
git add src/lib/data/errors.ts src/lib/data/errors.test.ts
git commit -m "feat(data): add DomainError + mapHttpError with mapping tests"
```

---

### Task 2: Resource switch (source.ts)

**Files:**
- Create: `src/lib/data/source.ts`
- Test: `src/lib/data/source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Resource` (the SUPPORTED union)
  - `const SUPPORTED: readonly Resource[]`
  - `function hasApiBase(): boolean`
  - `function source(resource: Resource): "mock" | "live"`
  - `function assertResourceEnv(): void` (fail-fast; called once at startup)

- [ ] **Step 1: Write the failing test**

`src/lib/data/source.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

// source.ts reads import.meta.env; stub per-test then re-import fresh.
async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.stubGlobal("import", undefined); // noop guard
  for (const [k, v] of Object.entries(env)) {
    (import.meta as unknown as { env: Record<string, string> }).env[k] = v;
  }
  return import("./source");
}

afterEach(() => {
  delete (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL;
  delete (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_RESOURCES;
  vi.unstubAllGlobals();
});

describe("source()", () => {
  test("no base URL → everything mock", async () => {
    const m = await load({ VITE_API_RESOURCES: "merchants" });
    expect(m.hasApiBase()).toBe(false);
    expect(m.source("merchants")).toBe("mock");
  });

  test("base set, resource listed → live", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "merchants,banks" });
    expect(m.source("merchants")).toBe("live");
    expect(m.source("teams")).toBe("mock");
  });

  test("base set, '*' → all supported live", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "*" });
    expect(m.source("teams")).toBe("live");
    expect(m.source("workflows")).toBe("live");
  });

  test("assertResourceEnv throws on unknown resource name", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "merchants,bogus" });
    expect(() => m.assertResourceEnv()).toThrow(/bogus/);
  });

  test("assertResourceEnv accepts '*' and known names", async () => {
    const m = await load({ VITE_API_BASE_URL: "/api/v1", VITE_API_RESOURCES: "*" });
    expect(() => m.assertResourceEnv()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/data/source.test.ts`
Expected: FAIL — cannot resolve `./source`.

- [ ] **Step 3: Write `src/lib/data/source.ts`**

```ts
// ============================================================
// Mock-vs-live resource switch (spec §4). Lives entirely in the
// data layer — screens never read env. Per-resource opt-in via
// VITE_API_RESOURCES (comma list or "*"). Unknown names fail fast
// in dev so a typo can't silently leave a screen on mock.
// ============================================================

export const SUPPORTED = [
  "reference-data",
  "organizations",
  "teams",
  "roles",
  "banks",
  "merchants",
  "reports",
  "audit",
  "notifications",
  "requests",
  "workflows",
  "users",
] as const;

export type Resource = (typeof SUPPORTED)[number];

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

function parseEnv(): Set<string> {
  return new Set(
    (import.meta.env.VITE_API_RESOURCES ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
  );
}

export function hasApiBase(): boolean {
  return BASE_URL.length > 0;
}

export function source(resource: Resource): "mock" | "live" {
  if (!hasApiBase()) return "mock";
  const list = parseEnv();
  if (list.has("*")) return "live";
  return list.has(resource) ? "live" : "mock";
}

/** Throw in dev if VITE_API_RESOURCES names an unsupported resource. Call once at startup. */
export function assertResourceEnv(): void {
  const list = parseEnv();
  const supported = new Set<string>(SUPPORTED);
  for (const name of list) {
    if (name === "*") continue;
    if (!supported.has(name)) {
      const msg = `VITE_API_RESOURCES contains unsupported resource "${name}". Supported: ${SUPPORTED.join(", ")}.`;
      if (import.meta.env.DEV) throw new Error(msg);
      else console.error(msg);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/data/source.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the fail-fast check at startup**

In `src/router.tsx`, import and call once:

```ts
import { assertResourceEnv } from "@/lib/data/source";

export const getRouter = () => {
  assertResourceEnv();
  const queryClient = makeQueryClient(); // updated in Task 3
  // ...
```

(If Task 3 isn't done yet, leave `new QueryClient()` here and only add the `assertResourceEnv()` line; Task 3 swaps the client.)

- [ ] **Step 6: Build gates + commit**

```bash
bunx tsc --noEmit && bun run lint
git add src/lib/data/source.ts src/lib/data/source.test.ts src/router.tsx
git commit -m "feat(data): add resource switch with dev fail-fast on unknown names"
```

---

### Task 3: Query config + contract types (query.ts)

**Files:**
- Create: `src/lib/data/query.ts`
- Test: `src/lib/data/query.test.ts`
- Modify: `src/router.tsx` (use `makeQueryClient()`)

**Interfaces:**
- Consumes: `DomainError`, `isDomainError` from `./errors`.
- Produces:
  - `interface ReadResult<T> { data: T | undefined; isLoading: boolean; error: DomainError | null; refetch: () => void }`
  - `interface MutationHandle<TInput, TResult = void> { mutate: (input: TInput) => Promise<TResult>; isPending: boolean; error: DomainError | null; reset: () => void }`
  - `function makeQueryClient(): QueryClient` (retry rules by `kind`)
  - `function mockRead<T>(data: T): ReadResult<T>` (constant async-shaped result for mock adapters)
  - `function shouldRetry(failureCount: number, error: unknown): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/data/query.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { shouldRetry, mockRead } from "./query";
import { mapHttpError, networkError } from "./errors";

describe("shouldRetry", () => {
  test("never retries forbidden/validation/conflict/blocked/unauthorized", () => {
    for (const status of [403, 422, 409, 401]) {
      expect(shouldRetry(0, mapHttpError(status, {}))).toBe(false);
    }
    expect(shouldRetry(0, mapHttpError(406, "<html>", "text/html"))).toBe(false);
  });

  test("retries network once, not twice", () => {
    expect(shouldRetry(0, networkError(new Error("x")))).toBe(true);
    expect(shouldRetry(1, networkError(new Error("x")))).toBe(false);
  });

  test("does not retry non-DomainError", () => {
    expect(shouldRetry(0, new Error("plain"))).toBe(false);
  });
});

describe("mockRead", () => {
  test("returns async-shaped result with no loading/error", () => {
    const r = mockRead([1, 2, 3]);
    expect(r.data).toEqual([1, 2, 3]);
    expect(r.isLoading).toBe(false);
    expect(r.error).toBeNull();
    expect(() => r.refetch()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/data/query.test.ts`
Expected: FAIL — cannot resolve `./query`.

- [ ] **Step 3: Write `src/lib/data/query.ts`**

```ts
// ============================================================
// Shared query layer (spec §3.1, §3.2, §9). Defines the stable
// read/mutation contract types the UI sees, plus the QueryClient
// retry policy keyed on DomainError.kind.
// ============================================================

import { QueryClient } from "@tanstack/react-query";
import { isDomainError, type DomainError } from "./errors";

/** Async-shaped read result — identical for mock and live (spec §3.1). */
export interface ReadResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: DomainError | null;
  refetch: () => void;
}

/** Promise-based mutation handle; the Promise is the source of truth (spec §3.2). */
export interface MutationHandle<TInput, TResult = void> {
  mutate: (input: TInput) => Promise<TResult>;
  isPending: boolean;
  error: DomainError | null;
  reset: () => void;
}

/** Constant mock read: data is synchronous, never loading, never errors. */
export function mockRead<T>(data: T): ReadResult<T> {
  return { data, isLoading: false, error: null, refetch: () => {} };
}

/** Retry only transient network failures, once. Everything else is terminal. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isDomainError(error)) return false;
  if (error.kind !== "network") return false;
  return failureCount < 1;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/data/query.test.ts`
Expected: PASS.

- [ ] **Step 5: Use `makeQueryClient()` in the router**

Modify `src/router.tsx`:

```ts
import { QueryClient } from "@tanstack/react-query"; // keep type import for context
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { assertResourceEnv } from "@/lib/data/source";
import { makeQueryClient } from "@/lib/data/query";

export const getRouter = () => {
  assertResourceEnv();
  const queryClient = makeQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
```

- [ ] **Step 6: Verify app still boots + build gates + commit**

Run: `bun run build`
Expected: build succeeds (router still constructs a QueryClient).

```bash
bunx tsc --noEmit && bun run lint
git add src/lib/data/query.ts src/lib/data/query.test.ts src/router.tsx
git commit -m "feat(data): add read/mutation contract types + retry policy"
```

---

### Task 4: HTTP client (http.ts)

**Files:**
- Create: `src/lib/data/http.ts`
- Test: `src/lib/data/http.test.ts`

**Interfaces:**
- Consumes: `mapHttpError`, `networkError` from `./errors`.
- Produces:
  - `const tokenStore: { get(): string | null; set(t: string | null): void; clear(): void }`
  - `interface PageMeta { page: number; per_page: number; total: number; last_page: number }`
  - `const api`:
    - `get<T>(path, query?, signal?): Promise<T>`
    - `getList<T>(path, query?, signal?): Promise<{ data: T[]; meta?: PageMeta }>`
    - `post<T>(path, body?): Promise<T>`
    - `patch<T>(path, body?): Promise<T>`
    - `del<T>(path): Promise<T>`
  - All reject with a `DomainError`. Envelope `{ success, message, data }` / `{ data, meta }` is unwrapped to `data`.

- [ ] **Step 1: Write the failing test**

`src/lib/data/http.test.ts` (mock `fetch`; assert unwrap + error mapping):

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isDomainError } from "./errors";

function jsonResponse(status: number, body: unknown, contentType = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

let api: typeof import("./http").api;

beforeEach(async () => {
  vi.resetModules();
  ({ api } = await import("./http"));
});
afterEach(() => vi.restoreAllMocks());

describe("api.get unwraps envelope", () => {
  test("{success,message,data} → data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, message: "ok", data: { id: 1 } }),
    ));
    await expect(api.get("/thing")).resolves.toEqual({ id: 1 });
  });
});

describe("api.getList returns data + meta", () => {
  test("{data,meta}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: 1 }], meta: { page: 1, per_page: 20, total: 1, last_page: 1 } }),
    ));
    const r = await api.getList("/things");
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.meta?.total).toBe(1);
  });
});

describe("errors map to DomainError", () => {
  test("422 → validation DomainError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(422, { message: "bad", errors: { name: ["required"] } }),
    ));
    await api.post("/things", {}).catch((e) => {
      expect(isDomainError(e)).toBe(true);
      expect(e.kind).toBe("validation");
    });
    expect.assertions(2);
  });

  test("fetch throw → network DomainError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await api.get("/things").catch((e) => {
      expect(isDomainError(e)).toBe(true);
      expect(e.kind).toBe("network");
    });
    expect.assertions(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/data/http.test.ts`
Expected: FAIL — cannot resolve `./http`.

- [ ] **Step 3: Write `src/lib/data/http.ts`**

```ts
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
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
let token: string | null = read();

export const tokenStore = {
  get: () => token,
  set: (t: string | null) => {
    token = t;
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* private mode */ }
  },
  clear: () => {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* */ }
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
  try { return JSON.parse(text); } catch { return text; }
}

async function request(method: Method, path: string, opts: { body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<unknown> {
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

  getList: async <T>(path: string, query?: Query, signal?: AbortSignal): Promise<{ data: T[]; meta?: PageMeta }> => {
    const body = await request("GET", path, { query, signal });
    const data = (unwrap(body) ?? []) as T[];
    const meta = (body as { meta?: PageMeta } | null)?.meta;
    return { data: Array.isArray(data) ? data : [], meta };
  },

  post: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap(await request("POST", path, { body })) as T,

  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap(await request("PATCH", path, { body })) as T,

  del: async <T>(path: string): Promise<T> =>
    unwrap(await request("DELETE", path)) as T,
};

export type { DomainError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/data/http.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Build gates + commit**

```bash
bunx tsc --noEmit && bun run lint
git add src/lib/data/http.ts src/lib/data/http.test.ts
git commit -m "feat(data): add fetch client with envelope unwrap + DomainError mapping"
```

---

### Task 5: Template resource — reference-data, end-to-end

**Files:**
- Create: `src/lib/data/reference-data.ts`
- Test: `src/lib/data/reference-data.test.ts` (mapper + key factory only)
- Modify: `src/lib/governance.ts` (add optional `_version` to `ReferenceTable`/`ReferenceValue`)
- Modify: `src/routes/admin.reference-data.tsx` (consume the two hooks)

**Note on `_version`:** the live backend uses optimistic-lock `version`. The mock
`ReferenceTable`/`ReferenceValue` types currently carry no version field. We add an
**optional** `_version?: number` to both — it's written/read only by the live
adapter, never by mock code or the screen, so it does not change mock behavior. This
is the one mock-layer type touch this task makes; it is additive and optional.

**Interfaces:**
- Consumes: `api`, `tokenStore` from `./http`; `ReadResult`, `MutationHandle`, `mockRead` from `./query`; `source` from `./source`; `referenceTablesCell`, `ReferenceTable`, `ReferenceValue` from `@/lib/governance`.
- Produces:
  - `const referenceKeys` (factory per spec §3.6)
  - `function toReferenceTable(dto): ReferenceTable`
  - `function useReferenceTables(): ReadResult<ReferenceTable[]>`
  - `function useReferenceMutations(): { createTable: MutationHandle<{key:string;label:string}, ReferenceTable>; createValue: MutationHandle<{tableId:string;key:string;label:string}, ReferenceValue>; removeTable: MutationHandle<{id:string}>; removeValue: MutationHandle<{id:string}> }`

- [ ] **Step 1: Add optional `_version` to the mock reference types**

In `src/lib/governance.ts`, extend both types (additive, optional — no mock behavior change):

```ts
export type ReferenceValue = {
  id: string;
  key: string;
  label: string;
  _version?: number; // live optimistic-lock; ignored by mock + UI
};

export type ReferenceTable = {
  id: string;
  key: string;
  label: string;
  system?: boolean;
  values: ReferenceValue[];
  _version?: number; // live optimistic-lock; ignored by mock + UI
};
```

Run: `bunx tsc --noEmit`
Expected: PASS (optional field, existing mock seed data still valid).

- [ ] **Step 2: Write the failing test (mapper + keys — the testable pure logic)**

`src/lib/data/reference-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { toReferenceTable, referenceKeys } from "./reference-data";

describe("toReferenceTable", () => {
  test("maps DTO → domain, string ids, nested values, version", () => {
    const t = toReferenceTable({
      id: 7, key: "sectors", label: "Sectors", is_system: true, version: 3,
      values: [{ id: 11, key: "agri", label: "Agriculture", version: 2 }],
    });
    expect(t).toEqual({
      id: "7", key: "sectors", label: "Sectors", system: true, _version: 3,
      values: [{ id: "11", key: "agri", label: "Agriculture", _version: 2 }],
    });
  });

  test("missing values → empty array, never crash", () => {
    expect(toReferenceTable({ id: 1, key: "k", label: "L" }).values).toEqual([]);
  });
});

describe("referenceKeys factory (spec §3.6)", () => {
  test("root / lists / list / details / detail shape", () => {
    expect(referenceKeys.all).toEqual(["reference-data"]);
    expect(referenceKeys.lists()).toEqual(["reference-data", "list"]);
    expect(referenceKeys.list({ q: "x" })).toEqual(["reference-data", "list", { q: "x" }]);
    expect(referenceKeys.detail("7")).toEqual(["reference-data", "detail", "7"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test src/lib/data/reference-data.test.ts`
Expected: FAIL — cannot resolve `./reference-data`.

- [ ] **Step 4: Write `src/lib/data/reference-data.ts`**

```ts
// ============================================================
// Reference Data adapter (template resource — spec §6). Exposes a
// stable hook surface; picks mock vs live via source(). DTO↔domain
// mapping lives here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import {
  referenceTablesCell,
  type ReferenceTable,
  type ReferenceValue,
} from "@/lib/governance";

const KEY = "reference-data" as const;

// ---------- Query key factory (spec §3.6) ----------
export const referenceKeys = {
  all: [KEY] as const,
  lists: () => [...referenceKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...referenceKeys.lists(), filters ?? {}] as const,
  details: () => [...referenceKeys.all, "detail"] as const,
  detail: (id: string) => [...referenceKeys.details(), id] as const,
};

// ---------- DTO → domain ----------
interface RefValueDto { id: number; key: string; label: string; version?: number; is_system?: boolean }
interface RefTableDto { id: number; key: string; label: string; is_system?: boolean; version?: number; values?: RefValueDto[] }

export function toReferenceTable(dto: RefTableDto): ReferenceTable {
  return {
    id: String(dto.id),
    key: dto.key,
    label: dto.label,
    system: dto.is_system,
    _version: dto.version,
    values: (dto.values ?? []).map((v) => ({
      id: String(v.id),
      key: v.key,
      label: v.label,
      _version: v.version,
    })),
  };
}

// ---------- Read hook ----------
export function useReferenceTables(): ReadResult<ReferenceTable[]> {
  const live = source(KEY) === "live";
  const cell = referenceTablesCell.use();
  const query = useQuery({
    queryKey: referenceKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<RefTableDto>("/reference-tables", { per_page: 100 }, signal).then((r) => {
        const tables = r.data.map(toReferenceTable);
        referenceTablesCell.set(tables); // hydrate cell as sync lookup cache (spec §3.4)
        return tables;
      }),
  });

  if (!live) return mockRead(cell);
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: (query.error as ReadResult<unknown>["error"]) ?? null,
    refetch: () => void query.refetch(),
  };
}

// ---------- Mutations ----------
function useLiveMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: referenceKeys.lists() });

  const createTable = useMutation({
    mutationFn: (i: { key: string; label: string }) =>
      api.post<RefTableDto>("/reference-tables", i).then(toReferenceTable),
    onSuccess: invalidate,
  });
  const createValue = useMutation({
    mutationFn: (i: { tableId: string; key: string; label: string }) =>
      api
        .post<RefValueDto>(`/reference-tables/${i.tableId}/values`, { key: i.key, label: i.label })
        .then((v) => ({ id: String(v.id), key: v.key, label: v.label, _version: v.version }) as ReferenceValue),
    onSuccess: invalidate,
  });
  // No hard delete — deactivate via PATCH is_active (POST /deactivate is WAF-blocked, spec §7).
  const removeTable = useMutation({
    mutationFn: (i: { id: string }) => api.patch(`/reference-tables/${i.id}`, { is_active: false }).then(() => undefined),
    onSuccess: invalidate,
  });
  const removeValue = useMutation({
    mutationFn: (i: { id: string }) => api.patch(`/reference-values/${i.id}`, { is_active: false }).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createTable, createValue, removeTable, removeValue };
}

function handle<TInput, TResult>(
  m: { mutateAsync: (i: TInput) => Promise<TResult>; isPending: boolean; error: unknown; reset: () => void },
): MutationHandle<TInput, TResult> {
  return {
    mutate: (i) => m.mutateAsync(i),
    isPending: m.isPending,
    error: (m.error as MutationHandle<TInput, TResult>["error"]) ?? null,
    reset: m.reset,
  };
}

const idle = { isPending: false, error: null as null, reset: () => {} };

export function useReferenceMutations() {
  const live = source(KEY) === "live";
  const liveM = useLiveMutations(); // hooks run every render regardless (stable order)

  if (live) {
    return {
      createTable: handle(liveM.createTable),
      createValue: handle(liveM.createValue),
      removeTable: handle(liveM.removeTable),
      removeValue: handle(liveM.removeValue),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createTable: {
      ...idle,
      mutate: async (i: { key: string; label: string }) => {
        const t: ReferenceTable = { id: `rt_${Date.now()}`, key: i.key, label: i.label, values: [] };
        referenceTablesCell.set((prev) => [...prev, t]);
        return t;
      },
    } as MutationHandle<{ key: string; label: string }, ReferenceTable>,
    createValue: {
      ...idle,
      mutate: async (i: { tableId: string; key: string; label: string }) => {
        const v: ReferenceValue = { id: `rv_${Date.now()}`, key: i.key, label: i.label };
        referenceTablesCell.set((prev) =>
          prev.map((t) => (t.id === i.tableId ? { ...t, values: [...t.values, v] } : t)));
        return v;
      },
    } as MutationHandle<{ tableId: string; key: string; label: string }, ReferenceValue>,
    removeTable: {
      ...idle,
      mutate: async (i: { id: string }) => {
        referenceTablesCell.set((prev) => prev.filter((t) => t.id !== i.id));
      },
    } as MutationHandle<{ id: string }>,
    removeValue: {
      ...idle,
      mutate: async (i: { id: string }) => {
        referenceTablesCell.set((prev) =>
          prev.map((t) => ({ ...t, values: t.values.filter((v) => v.id !== i.id) })));
      },
    } as MutationHandle<{ id: string }>,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/lib/data/reference-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Rewire the screen to the hooks only**

In `src/routes/admin.reference-data.tsx`, replace the direct cell usage with the data-layer hooks. Remove any `referenceTablesCell` import from the screen; remove all mock/live branching. The component reads `const { data: tables = [], isLoading, error } = useReferenceTables();` and calls `const { createTable, createValue, removeTable, removeValue } = useReferenceMutations();`. Each handler becomes:

```tsx
// add
import { useReferenceTables, useReferenceMutations } from "@/lib/data/reference-data";
import { isDomainError } from "@/lib/data/errors";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// inside the component:
const { data: tables = [], isLoading } = useReferenceTables();
const { createTable, createValue, removeTable, removeValue } = useReferenceMutations();

async function onAddTable(key: string, label: string) {
  try {
    await createTable.mutate({ key, label });
    toast.success("Table added");
  } catch (e) {
    toast.error(isDomainError(e) ? e.message : "Could not add table");
  }
}
// ...same try/await/catch shape for addValue/removeTable/removeValue,
// each awaiting the matching mutate() and surfacing isDomainError(e) ? e.message.

// render guard (only meaningful in live mode; mock isLoading is always false):
{isLoading ? (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
) : (
  /* existing table JSX, unchanged, now driven by `tables` */
)}
```

Keep every other line of the screen's JSX/UX exactly as-is. The only changes: data source (hooks), the loading guard, and `await … catch` error toasts. **No `isApiEnabled`, no env, no DTOs, no React Query in this file.**

- [ ] **Step 7: Verify the screen — mock mode unchanged, then live smoke**

Run (mock — default env): `bun run build` then `bun run dev`, open `/admin/reference-data`, confirm tables render and add/remove behave exactly as before.
Expected: identical to pre-change behavior.

Live smoke (against backend): set `.env` `VITE_API_RESOURCES=reference-data`, restart dev (proxy). Log in as `admin@cby.gov.ye / Password@123`, open the screen, confirm the live reference tables load (200, nested `values`), and an add round-trips.
Expected: live data renders; on a forbidden/validation error a toast shows `error.message`.

- [ ] **Step 8: Build gates + commit**

```bash
bunx tsc --noEmit && bun run lint && bun run test
git add src/lib/governance.ts src/lib/data/reference-data.ts src/lib/data/reference-data.test.ts src/routes/admin.reference-data.tsx
git commit -m "feat(data): wire reference-data through the adapter layer (template)"
```

---

### Task 6: Seed the two review documents

**Files:**
- Create: `docs/backend-handoff/UI-CHANGES.md`
- Create: `docs/backend-handoff/BACKEND-HANDOFF.md`

**Interfaces:**
- Consumes: nothing (documentation).
- Produces: two living docs the remaining resource plans append to.

- [ ] **Step 1: Create `docs/backend-handoff/UI-CHANGES.md`**

```markdown
# Required UI / UX / Functionality Changes — Review Before Implementation

Each entry is a UI/UX/functionality change that turns out to be **required** to
support the live backend. **Nothing here is implemented until explicitly approved.**
Implementation of anything needing no UI change proceeds immediately (spec §8).

| # | Screen | Change | Why it's unavoidable | Smallest change | Status |
|---|--------|--------|----------------------|-----------------|--------|
| — | — | (none yet) | — | — | — |

## reference-data (template resource)
No UI change required. Reads + create + deactivate map cleanly to the existing
screen. Loading state reuses the existing layout; errors reuse the existing toast.
```

- [ ] **Step 2: Create `docs/backend-handoff/BACKEND-HANDOFF.md`**

```markdown
# Backend Handoff — Gaps, Mismatches & Requests

Backend dependencies discovered while wiring the live API. Tracked independently;
does not block unrelated front-end work (spec §8). Snippets reference the read-only
`backend/` clone where useful.

## Open items

| # | Resource | Type | Detail | Evidence |
|---|----------|------|--------|----------|
| BH-01 | status-toggle | infra | `POST /{resource}/{id}/activate\|deactivate\|suspend` return 406 from ModSecurity on real records. Front-end uses `PATCH {is_active}` where it works; merchants has no workaround → toggle rejects with `DomainError{kind:"blocked"}`. | See project memory `waf-blocks-status-toggle`. |
| BH-02 | workflows | missing endpoints | No workflow authoring write endpoints. Authoring mutations reject with `kind:"blocked"`; read path wires to the published workflow. | Audit on `live` branch. |

## reference-data
No backend gap. `GET /reference-tables` nests `values`; create + `PATCH is_active`
deactivate confirmed against the live host.
```

- [ ] **Step 3: Commit**

```bash
git add docs/backend-handoff/UI-CHANGES.md docs/backend-handoff/BACKEND-HANDOFF.md
git commit -m "docs(handoff): seed UI-changes + backend-handoff review docs"
```

---

## Self-Review

**Spec coverage:**
- §2 architecture / `src/lib/data/` layout → Tasks 1–5 create exactly those files. ✓
- §3.1 ReadResult → Task 3 (type) + Task 5 (use). ✓
- §3.2 MutationHandle, async-always, returns entity → Task 3 (type) + Task 5 (mock+live). ✓
- §3.3 DomainError + mapping table → Task 1 (full table tested). ✓
- §3.4 sync helpers via cell-as-cache → Task 5 read hook hydrates `referenceTablesCell`. ✓
- §3.5 adapter independence → Global Constraints + Task 5 imports only shared utils. ✓
- §3.6 query-key factory → Task 3 (convention) + Task 5 (`referenceKeys`, tested). ✓
- §4 resource switch + fail-fast → Task 2 (tested) + wired in router. ✓
- §7 blocked writes (stub, same contract) → Task 5 deactivate via PATCH; BH-01/02 in Task 6. ✓
- §8 two review docs → Task 6. ✓
- §9 retry policy by kind → Task 3 `shouldRetry` (tested). ✓
- §10 testing scope (mapHttpError, source, keys, mappers; not thin CRUD) → Tasks 1–5 test exactly those. ✓
- §11 migration order: this plan = foundation + reference-data (step 2); remaining resources are follow-up plans. ✓

**Out of scope (follow-up plans, one per resource or small cluster):** organizations, teams, roles, banks, merchants, reports, audit, notifications, requests, workflows (read-only), users, auth. Each replicates Task 5 against its own endpoints + DTOs, appends to the two handoff docs, and flips its `VITE_API_RESOURCES` key after live smoke.

**Placeholder scan:** no TBD/TODO; every code step shows full code; the screen rewire (Task 5 step 5) shows the exact imports, hook calls, error pattern, and loading guard. ✓

**Type consistency:** `ReadResult`/`MutationHandle` defined in Task 3, consumed verbatim in Task 5. `mapHttpError(status, body, contentType?)` signature identical in Task 1 def and Task 4 call. `referenceKeys` shape identical in Task 5 def and its test. `source(resource)` / `hasApiBase()` / `assertResourceEnv()` consistent across Tasks 2–3. ✓
