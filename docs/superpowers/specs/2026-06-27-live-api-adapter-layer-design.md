# Live API Adapter Layer — Design

**Date:** 2026-06-27
**Branch:** `live2`
**Status:** Awaiting review

## 1. Problem & Goal

The app (React 19 + Vite + TanStack Router/Query, bun) currently runs entirely on
mock data: reactive `cell<T>()` stores backed by `localStorage` (`src/lib/db.ts`,
`src/lib/governance.ts`, `src/lib/mock.ts`, `src/lib/workflow-engine/storage.ts`).
We need to wire it to the live backend (`https://cby2.ultimate-dev2.com`, base path
`/api/v1`, Laravel + Sanctum) **without changing UI, UX, or functionality**.

A prior attempt exists on branch `live` (53 commits). It works but took the wrong
shape: every migrated screen grew a `useXController()` hook that calls **both** the
mock cell hooks and the live React Query hooks every render, then branches inline
with `if (apiEnabled)`. The mock-vs-live fork leaked into ~13 route/component files,
each doubling in size, with duplicated read+write logic interleaved in the UI layer.

**Goal:** Re-do the integration cleanly from the demo state on `live2`. Push the
mock-vs-live decision entirely into the data layer behind a stable per-resource
contract, so screens consume one interface and never know which backend answers.

### Non-goals

- No change to UI/UX/functionality. Any change that turns out to be *required* is
  proposed in `docs/backend-handoff/UI-CHANGES.md` and **blocks** until approved.
- No re-use of the `live` branch's controller pattern. We mine `live` only for
  proven endpoint shapes and DTO mappings, not its architecture.
- Not building backend endpoints. Backend gaps are recorded in
  `docs/backend-handoff/BACKEND-HANDOFF.md`.

## 2. Architecture

```
  ┌─────────────────────────────────────────────┐
  │ UI layer (routes/, components/)              │
  │  consumes ONLY the resource hook surface:    │
  │    useReferenceTables() → { data, isLoading, │
  │       error, refetch }                       │
  │    useReferenceMutations() → { createTable,  │
  │       ... } (async, Promise-based)           │
  │  NO apiEnabled. NO env checks. NO DTOs.      │
  │  NO React Query imports. NO source branching.│
  └───────────────────┬─────────────────────────┘
                      │  stable contract (domain models in/out)
  ┌───────────────────┴─────────────────────────┐
  │ Data layer: per-resource adapter             │
  │  src/lib/data/<resource>.ts                  │
  │   - picks mock vs live ONCE via source('key')│
  │   - mock adapter: cell snapshot + sync writes│
  │   - live adapter: React Query + fetch client │
  │   - both return the SAME normalized domain   │
  │     model and throw the SAME DomainError     │
  └─────────┬──────────────────────┬─────────────┘
            │ mock                  │ live
  ┌─────────┴────────┐   ┌──────────┴─────────────┐
  │ cell<T> stores   │   │ HTTP client (fetch)    │
  │ (governance.ts,  │   │ src/lib/data/http.ts   │
  │  mock.ts, db.ts) │   │  - Sanctum token+cookie│
  └──────────────────┘   │  - envelope unwrap     │
                         │  - DomainError mapping │
                         └────────────────────────┘
```

The **only** new public surface the UI imports is the per-resource hook module.
Everything else — the HTTP client, React Query, DTO mappers, the env switch — is an
implementation detail of the data layer.

### Directory layout

```
src/lib/data/
  source.ts          # resource-switch: source('reference-data') → 'mock' | 'live'
  errors.ts          # DomainError type + mapHttpError() + isDomainError()
  http.ts            # fetch wrapper, token store, envelope unwrap, error mapping
  query.ts           # shared QueryClient config + async-shaped read result type
  reference-data.ts  # adapter + hooks (template — see §6)
  organizations.ts
  teams.ts
  roles.ts
  banks.ts
  merchants.ts
  reports.ts
  audit.ts
  notifications.ts
  requests.ts
  workflows.ts       # read-only (authoring writes blocked — see §7)
  users.ts
  auth.ts
```

(We use `src/lib/data/` rather than `live`'s `src/lib/api/` to signal the different
architecture and avoid confusion with ported code.)

## 3. Contracts (the heart of the design)

These contracts are identical regardless of backing source. The adapter is
responsible for making mock and live satisfy them identically.

### 3.1 Read contract — async-shaped always

```ts
interface ReadResult<T> {
  data: T | undefined;   // undefined while first load is in flight
  isLoading: boolean;    // mock: always false
  error: DomainError | null;
  refetch: () => void;   // mock: no-op
}
```

Mock adapter returns `{ data: cell.use(), isLoading: false, error: null,
refetch: () => {} }`. Live adapter wraps a `useQuery` and projects it into the same
shape. Screens write one code path: render `data`, show spinner on `isLoading`,
show `error.message` on `error`.

### 3.2 Mutation contract — async-always, Promise is source of truth

```ts
// A mutation function. Resolves with the created/updated entity where meaningful,
// else void. Rejects with a DomainError. Mock resolves immediately; live awaits.
type Mutate<TInput, TResult = void> = (input: TInput) => Promise<TResult>;

// Returned from a resource's mutations hook. State is CONVENIENCE only —
// the Promise remains the source of truth for success/failure.
interface MutationHandle<TInput, TResult = void> {
  mutate: Mutate<TInput, TResult>;
  isPending: boolean;
  error: DomainError | null;
  reset: () => void;
}
```

Call site is identical for mock and live:

```ts
await createMerchant(input);          // success flow
// or
try { await updateMerchant(input); }
catch (e) { /* e is DomainError — one handling path */ }
```

Mock mutations return a resolved Promise (and may deliberately reject with a
`DomainError` only where the mock already simulates a conflict, e.g. duplicate
invoice). They never reject for transport reasons.

### 3.3 Error contract — DomainError (business meaning, not transport)

```ts
type DomainError = {
  kind:
    | "validation"     // 422 — field errors present
    | "conflict"       // 409 STALE_RESOURCE / optimistic lock / dup
    | "forbidden"      // 403 — lacks permission
    | "blocked"        // 406 WAF block on status-toggle (infra, see memory)
    | "unauthorized"   // 401 — token missing/expired
    | "network"        // fetch failed / 5xx / timeout
    | "unknown";       // anything unmapped — never leaks raw API shape
  message: string;                 // human-readable, safe to show
  fields?: Record<string, string[]>; // for "validation" — forms bind directly
  meta?: {                         // diagnostics ONLY — never drives UI
    status?: number;
    code?: string;
    requestId?: string;
    cause?: unknown;
  };
};
```

**Hard rule:** the UI never branches on `status === 409` or `code === "STALE_RESOURCE"`.
It only reacts to `error.kind`. The adapter owns the entire mapping from backend
detail to `kind`. Unknown/new backend responses map to `kind: "unknown"`, never leak.

`mapHttpError(response, body)` in `src/lib/data/errors.ts` is the single mapping
function. Mapping table:

| Backend | kind |
|---|---|
| 422 + `errors` map | `validation` (populate `fields`) |
| 409, or body `code: STALE_RESOURCE` | `conflict` |
| 403 | `forbidden` |
| 406 text/html (WAF) | `blocked` |
| 401 | `unauthorized` |
| fetch throw / timeout / 500–504 | `network` |
| anything else | `unknown` |

### 3.4 Sync lookup helpers (the sharp edge)

`governance.ts` exposes synchronous helpers screens call mid-render and outside
components: `getOrgLabel(id)`, `getTeamLabel(id)`, `getRoleCatalog(id)`,
`getOrgCategory(org)`, `referenceValues(key)`, `referenceLabels(key)`, `can(...)`.
These read the *current cell snapshot* synchronously. They cannot become async
without rewriting many call sites — which would violate "don't change UI/UX."

**Resolution:** these helpers stay synchronous and keep reading the cell. In live
mode, each live read adapter **hydrates its cell** as a synchronous lookup cache on
fetch success (write the normalized domain models into the cell). The cell stops
being a source of truth in live mode and becomes a read-through cache that the
reactive hook fills. Sync helpers then resolve against live data with zero call-site
changes. This is the *only* place mock and live legitimately share the cell, and it
is a cache, not a second write path — mutations always go through the adapter, never
straight to the cell, in live mode.

### 3.5 Adapter independence

Resource adapters are **independent**. One adapter never imports or calls another
resource adapter. No `merchants.ts` reaching into `banks.ts`, no transitive
adapter graph.

Shared behavior lives in common utilities only — `http.ts`, `errors.ts`,
`query.ts`, `source.ts`, and small shared mappers/helpers — never in a peer
resource module. If two adapters need the same logic, it moves down into a shared
util; it does not move sideways.

Resources still relate at the *data* level (merchants display bank names and sector
labels). That relationship is satisfied without coupling, in one of two ways:

- the screen reads each resource's own hook and composes them in the UI, or
- the live read adapter resolves the label via the **shared sync lookup cache**
  (§3.4), which is a cross-cutting utility, not a sibling adapter.

The forbidden thing is an adapter `import`-ing another adapter or calling its hooks.
Composition happens in the UI or through shared utils, keeping every resource module
understandable and testable in isolation.

### 3.6 Query key convention

To keep cache invalidation predictable across all resources, every live adapter
builds its TanStack Query keys from one convention. Each resource module exports a
`<resource>Keys` factory shaped identically:

```ts
export const merchantKeys = {
  all:      ["merchants"] as const,                      // namespace root
  lists:    () => [...merchantKeys.all, "list"] as const, // all list queries
  list:     (filters?: Record<string, unknown>) =>        // one filtered list
              [...merchantKeys.lists(), filters ?? {}] as const,
  details:  () => [...merchantKeys.all, "detail"] as const,
  detail:   (id: string) => [...merchantKeys.details(), id] as const,
};
```

Rules:

- **Root** is `[<resource>]` (singular-or-plural, fixed per resource) — the
  invalidation handle for "everything in this resource."
- **Collections** live under `...all, "list"`; a filtered collection appends the
  normalized filter object so different filters cache separately but invalidate
  together.
- **Details** live under `...all, "detail", id`.
- After any mutation, the adapter invalidates at the **narrowest correct level**:
  a create/delete invalidates `lists()`; an update invalidates both `detail(id)`
  and `lists()`. Nothing invalidates another resource's keys (ties back to §3.5).
- Keys are **never** spelled inline in a screen or mid-adapter — only via the
  factory, so the convention can't drift.

`query.ts` documents this convention once; every resource follows it verbatim.

## 4. The resource switch

`src/lib/data/source.ts`:

```ts
const SUPPORTED = [
  "reference-data","organizations","teams","roles","banks","merchants",
  "reports","audit","notifications","requests","workflows","users",
] as const;
type Resource = typeof SUPPORTED[number];

// VITE_API_RESOURCES = comma list, or "*" for all supported.
export function source(resource: Resource): "mock" | "live" {
  if (!hasApiBase()) return "mock";
  const list = parseResourceEnv(); // Set<string>
  if (list.has("*")) return "live";
  return list.has(resource) ? "live" : "mock";
}
```

Constraints made explicit:

- Config lives entirely in the data layer. Screens never read env.
- `*` enables all **supported** resources for integration testing.
- **Fail-fast in dev:** an unsupported resource name in `VITE_API_RESOURCES`
  (one not in `SUPPORTED`) throws at startup in dev mode, so a typo can't silently
  leave a screen on mock. Production logs and ignores.
- The switch is implementation detail — it never appears in a hook/mutation
  signature and never changes the contract.

`hasApiBase()` (base URL present) gates auth/login separately, exactly as the
contracts are independent of source.

## 5. Data flow

**Read (live):** screen calls `useMerchants()` → adapter sees `source('merchants') ===
'live'` → `useQuery` hits `GET /merchants` via `http.ts` → envelope unwrapped → DTO
mapped to domain `Merchant[]` → cell hydrated for sync helpers → returned as
`ReadResult<Merchant[]>`. Screen renders `data`.

**Read (mock):** same `useMerchants()` → adapter sees `'mock'` → returns
`{ data: merchantsCell.use(), isLoading: false, error: null, refetch: noop }`.

**Write (live):** screen calls `await createMerchant(input)` → adapter maps domain
input → DTO → `POST /merchants` → on 2xx returns mapped entity + invalidates query
→ on failure `mapHttpError` throws `DomainError`. Screen `await`s, toasts on catch.

**Write (mock):** same call → adapter writes the cell synchronously, resolves with
the new entity. Identical call site.

## 6. Template resource: reference-data

`src/lib/data/reference-data.ts` is the reference implementation every other module
follows. It exposes exactly:

```ts
export function useReferenceTables(): ReadResult<ReferenceTable[]>;
export function useReferenceMutations(): {
  createTable: MutationHandle<{ key: string; label: string }, ReferenceTable>;
  createValue: MutationHandle<{ tableId: string; key: string; label: string }, ReferenceValue>;
  removeTable: MutationHandle<{ id: string }>;   // deactivate via PATCH is_active
  removeValue: MutationHandle<{ id: string }>;
};
```

Internally it has a `mockReferenceAdapter` and a `liveReferenceAdapter`, both
implementing the same internal `ReferenceAdapter` interface; the hook picks one via
`source('reference-data')`. The DTO↔domain mapping (`toReferenceTable`) lives here,
never in the screen. Optimistic-lock `version` is read from the domain model and
sent on PATCH by the live adapter only. The module exports a `referenceKeys` factory
following the §3.6 convention; the live adapter invalidates at the narrowest level
after each mutation. The adapter imports only shared utils (`http`, `errors`,
`query`, `source`) — never another resource module (§3.5).

The screen (`admin.reference-data.tsx`) imports `useReferenceTables` +
`useReferenceMutations` and nothing else from the data layer. No `isApiEnabled`,
no `ApiError`, no React Query.

Each subsequent resource is a near-mechanical repeat of this template.

## 7. Blocked writes (stub, don't fake)

Per the audit, some backend operations don't work live yet:

- **Workflow authoring writes** — no write endpoints exist. `workflows.ts` is
  read-only: read hooks wire to the live published workflow; authoring mutations
  exist in the contract but the live adapter's `mutate` rejects with
  `DomainError{ kind: "blocked", message: "Workflow authoring not yet supported by
  the backend." }`. No alternate UI path, no local-only fake persistence.
- **WAF-blocked status toggles** — `POST /{resource}/{id}/activate|deactivate|suspend`
  return 406 from ModSecurity on real records (infra, not Laravel — see project
  memory `waf-blocks-status-toggle`). Where a `PATCH {is_active}` workaround works
  (orgs/teams/roles/banks/reference), the live adapter uses it. Where no workaround
  exists (merchants), the toggle mutation rejects with `kind: "blocked"`.

Every blocked write keeps the **same public contract** — same function name, same
signature — and is recorded in `BACKEND-HANDOFF.md`. Screens hitting a blocked write
get a `DomainError` and show the message via their existing error path; no new UI.

## 8. The two review documents

- **`docs/backend-handoff/UI-CHANGES.md`** — every UI/UX/functionality change that
  turns out to be *required* to support the backend. Each entry: what, why it's
  unavoidable, smallest possible change. **Nothing here is implemented until you
  approve it.** Implementation of anything needing no UI change proceeds immediately.
- **`docs/backend-handoff/BACKEND-HANDOFF.md`** — backend gaps: missing endpoints,
  contract mismatches, blocked operations, with example payloads and code references
  from the read-only `backend/` clone where useful. Tracked independently; does not
  block unrelated front-end work.

These are living documents updated as each resource is wired.

## 9. Error handling

- All network/HTTP failure converges on `mapHttpError` → `DomainError`. One mapping,
  one type, exhaustive `kind`.
- React Query is configured (in `query.ts`) to **not** retry on `forbidden`,
  `unauthorized`, `validation`, `conflict`, `blocked` (retrying is pointless or
  harmful); it may retry once on `network`.
- A 401/`unauthorized` from any query clears the token store and the auth state
  follows the existing logout path — no new redirect logic beyond what the app has.
- Screens surface errors through their **existing** toast/error UI (`sonner`,
  inline messages). No new global error surface is introduced.

## 10. Testing

- **Contract tests (mock adapter):** each resource's mock adapter satisfies
  `ReadResult` / `MutationHandle` shapes; mutations resolve with the right entity;
  the deliberately-simulated mock rejections produce a `DomainError`.
- **Mapping tests:** `mapHttpError` covers every row of the §3.3 table, incl. the
  406-WAF→`blocked` and 409→`conflict` cases, and the unknown→`unknown` fallback.
- **Adapter parity:** for the template resource, a test asserts the mock and live
  adapters expose identical hook/mutation signatures (type-level + runtime shape).
- **Build gates:** `tsc`, `eslint`, `vite build` must pass after each resource —
  same gates the `live` branch used.
- **Live smoke:** per resource, a manual curl/login check against
  `cby2.ultimate-dev2.com` confirms the real shape before flipping its env key on.
  (No automated live tests — no CI creds, CORS via the Vite dev proxy.)

## 11. Migration order

Wire resources lowest-dependency first, verifying each against live before the next:

1. `auth` (login/me — gated by `hasApiBase`, independent of resource switch)
2. `reference-data` (template, no deps)
3. `organizations` → `teams` → `roles` → `banks`
4. `merchants` (depends on banks + reference sectors)
5. `reports`, `audit`, `notifications` (read-mostly)
6. `requests` (list + detail; create where supported)
7. `workflows` (read-only)
8. `users`

Each resource ships behind its own `VITE_API_RESOURCES` key, so mock stays the
default and any resource can go live in isolation.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Sync helpers break in live mode | Cell-as-cache hydration (§3.4); covered by parity test |
| Backend shape drifts from `live` branch's assumptions | Per-resource live smoke check before flipping env key (§10) |
| A blocked write looks "done" but isn't | Stub rejects with `kind:"blocked"` + logged in handoff (§7) |
| Required UI change sneaks in | Blocked by `UI-CHANGES.md` approval gate (§8) |
| Optimistic-lock conflicts surface as scary errors | `conflict` kind → existing toast with a friendly message |
| Adapters grow cross-resource coupling | §3.5 independence rule; per-module isolation test asserts no peer-adapter import |
| Cache invalidation drifts per resource | §3.6 single key convention via factory; reviewed per resource |
