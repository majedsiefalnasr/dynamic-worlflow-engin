# Live-DB Migration (PM Priority Reorder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the live-DB migration roadmap to the PM's minimum-viable priority (login → banks → users → merchants → request creation/stages), and implement the next two sub-projects that priority unblocks: a `users.ts` API client wired to `bank.users`/`admin.cby-staff`, and a verification pass + tax-uniqueness regression test for merchants ahead of the backend's CR-13 fix. Request runtime (create/actions/stages) is scoped as a follow-on sub-project, not built in this plan — it depends on backend work (CR-06 enrichment) not yet confirmed closed.

**Architecture:** Same pattern as every other migrated resource in this codebase: a thin `src/lib/api/<resource>.ts` client (DTO type + `to<Entity>`/`toWriteBody` mappers + React Query hooks) consumed by a `use<Resource>Controller()`-style branch inside the existing route component, gated by `isApiEnabled("<resource>")` from `src/lib/api/client.ts`. No new abstractions — copy the `roles.ts`/`merchants.ts` shape exactly.

**Tech Stack:** React 19, Vite, TanStack Router/Query, bun, TypeScript, Laravel 11 + Sanctum backend (separate repo, read-only clone at `backend/`).

## Global Constraints

- Never edit anything under `backend/` — it's a read-only clone for inspecting real backend code (branch `feature/import-request-missing-fields`). All backend changes go through `docs/backend-handoff/BACKEND-CHANGE-REQUESTS.md`.
- Every migrated screen must keep working on mock when its `VITE_API_RESOURCES` key is absent — never make a screen hard-depend on the live API. Follow the `isApiEnabled("<resource>")` branch pattern used by every existing `src/lib/api/*.ts` file.
- No string→int ID mapping layer — entity IDs become `String(numericId)` on the way in, `Number(id)` on the way out, exactly as `roles.ts`/`merchants.ts` already do.
- Token stays in memory only (`tokenStore` in `client.ts`) — never localStorage.
- `tsc`, `eslint`, and `vite build` must pass after every task (this repo's existing bar for every prior `src/lib/api/*.ts` addition).

---

## Part 0 — Roadmap reorder (docs only, no code)

### Task 0: Reorder the sub-project roadmap table to PM priority

**Files:**
- Modify: `docs/superpowers/specs/2026-06-25-local-backend-setup-design.md:18-27` (the roadmap table)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Replace the roadmap table**

Replace the existing table:

```markdown
| # | Sub-project | Depends on | Delivers |
|---|---|---|---|
| **1** | **Local backend setup + baseline verification** | — | Laravel running locally, 11 resources verified |
| 2 | Users system | #1 | `users.ts` client, `bank.users` + `admin.cby-staff` live |
| 3 | Workflow designer writes | #1 | Authoring UI writes to backend CRUD |
| 4 | Request runtime | #1, #3 | Create/draft/actions/documents via live API |
| 5 | Screen permissions gate | #1, #2 | `admin.screen-permissions` wired to live model |
| 6 | Mock removal + `VITE_API_RESOURCES=*` | #1–#5 | Remove `mock.ts`, `db.ts`, mock cells, `wfStore` mock paths |
```

with:

```markdown
| # | Sub-project | Depends on | Delivers | PM priority |
|---|---|---|---|---|
| **1** | **Local backend setup + baseline verification** | — | Laravel running locally, 11 resources verified | #1 login, #2 banks (already pass) |
| **2** | **Users system** | #1 | `users.ts` client, `bank.users` + `admin.cby-staff` live | #3 users |
| **3** | **Merchants verification + CR-13 close-out** | #1 | Bank-scoping confirmed (already correct); tax-number-per-bank regression test once backend ships the fix | #4 merchants |
| 4 | Request runtime | #1, #2 | Create/draft/actions/documents via live API | #5 requests + stages |
| 5 | Workflow designer writes | #1 | Authoring UI writes to backend CRUD | not currently prioritized |
| 6 | Screen permissions gate | #1, #2 | `admin.screen-permissions` wired to live model | not currently prioritized |
| 7 | Mock removal + `VITE_API_RESOURCES=*` | #1–#6 | Remove `mock.ts`, `db.ts`, mock cells, `wfStore` mock paths | final cleanup |
```

- [ ] **Step 2: Add a one-line note above the table explaining the reorder**

Insert directly above the table:

```markdown
**Reordered 2026-06-25 to match the project manager's minimum-viable priority**
(login → bank management → users → merchants → request creation/stages).
Workflow-designer authoring (old #3) and the screen-permissions gate (old #5)
are demoted, not cancelled — the PM has not asked for them yet.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-25-local-backend-setup-design.md
git commit -m "docs(spec): reorder roadmap to PM priority (users/merchants before workflow authoring)"
```

---

## Part 1 — Sub-project #2: Users system

The mock store (`src/lib/mock.ts:102-162`) has no CRUD functions — components mutate the `DEMO_USERS` array directly and call `saveUsers()`. The live client replaces that pattern with React Query hooks, exactly like every other resource.

### Task 1: Build `src/lib/api/users.ts`

**Files:**
- Create: `src/lib/api/users.ts`
- Test: manual (no test runner configured for `src/lib/api/*.ts` in this repo — every existing client file ships without a unit test; verification is `tsc`/`eslint`/`build` plus live click-through per the existing convention. Do not introduce a new test framework for this one file.)

**Interfaces:**
- Consumes: `api` from `./client` (`api.get`, `api.getList`, `api.post`, `api.patch`), `isApiEnabled` from `./client`, `User` type from `@/lib/mock` (`{ id, name, email, roleId, entityId, org, avatar, active?, phone?, orgKind?, teamId? }`).
- Produces: `useUsersQuery(enabled: boolean)`, `useUserMutations()` with `{ create, update, activate, deactivate, resetPassword }`, `userKeys` query-key object — same export shape as `roles.ts`/`merchants.ts` so Task 2/3 controllers can consume them identically.

- [ ] **Step 1: Write the DTO type and mapper**

```typescript
// ============================================================
// Users resource. Endpoints: /users (+ activate/deactivate, reset-password).
// CR-02 confirmed closed in backend code (2026-06-25): role_id is the
// canonical required field on create; the legacy `role` string is optional.
// CR-03 confirmed closed: activate/deactivate return 200/403, not 406.
// CR-04 still open: /users has no OpenAPI documentation (route exists live,
// confirmed via `curl .../api/v1/users` -> 401, not 404) — this DTO is
// hand-typed from backend/ source (StoreUserRequest/UpdateUserRequest), not
// generated. Re-check against backend/ if fields look wrong at runtime.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { User, RoleId } from "@/lib/mock";

interface UserDto {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role?: { id: number; code: string; name: string } | null;
  organization_id?: number;
  team_id?: number;
  bank_id?: number | null;
  phone?: string | null;
  is_active?: boolean;
  mfa_enabled?: boolean;
}

function toUser(d: UserDto): User {
  return {
    id: String(d.id),
    name: d.name,
    email: d.email,
    // roles.ts maps backend role.id -> RoleCatalogEntry.id (also a stringified
    // numeric id), so the same id string doubles as the RoleId-compatible
    // catalog key once roleCatalogCell is live. Cast through unknown — the
    // catalog id is a free-form string, not the mock's closed RoleId union.
    roleId: String(d.role_id ?? d.role?.id ?? "") as unknown as RoleId,
    entityId: d.bank_id != null ? String(d.bank_id) : null,
    org: "", // resolved by the screen from organizations/teams cells, not this DTO
    avatar: d.name.slice(0, 2),
    active: d.is_active ?? true,
    phone: d.phone ?? undefined,
  };
}

function toWriteBody(u: User) {
  return {
    name: u.name,
    email: u.email,
    role_id: Number(u.roleId),
    organization_id: undefined, // screen resolves this from the selected org/team before calling create
    team_id: undefined,
    bank_id: u.entityId ? Number(u.entityId) : undefined,
    phone: u.phone || undefined,
  };
}

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

export function useUsersQuery(enabled: boolean) {
  return useQuery({
    queryKey: userKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api.getList<UserDto>("/users", { per_page: 100 }, signal).then((r) => r.data.map(toUser)),
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: userKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: { user: User; password: string; organizationId: string; teamId: string }) =>
        api.post("/users", {
          ...toWriteBody(input.user),
          password: input.password,
          organization_id: Number(input.organizationId),
          team_id: Number(input.teamId),
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; user: User }) =>
        api.patch(`/users/${input.id}`, toWriteBody(input.user)),
      onSuccess: invalidate,
    }),
    activate: useMutation({
      mutationFn: (id: string) => api.post(`/users/${id}/activate`),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) => api.post(`/users/${id}/deactivate`),
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: (input: { id: string; password: string }) =>
        api.post(`/users/${input.id}/reset-password`, { password: input.password }),
    }),
  };
}
```

- [ ] **Step 2: Type-check**

Run: `bun run tsc --noEmit` (or the project's existing `tsc` script — check `package.json` for the exact command first; match whatever `roles.ts` was verified with).
Expected: no new errors attributable to `src/lib/api/users.ts`.

- [ ] **Step 3: Lint**

Run: `bun run lint` (or the project's existing eslint script).
Expected: no new errors in `src/lib/api/users.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/users.ts
git commit -m "feat(api): add users.ts client (CR-02 confirmed closed — role_id canonical)"
```

### Task 2: Wire `bank.users` to the live client

**Files:**
- Modify: `src/routes/bank.users.tsx` (432 lines — imports at top, component `BankUsers` starting after line ~30)

**Interfaces:**
- Consumes: `useUsersQuery`, `useUserMutations` from `src/lib/api/users.ts` (Task 1); `isApiEnabled` from `@/lib/api/client`.
- Produces: nothing new consumed elsewhere — this is a leaf screen.

- [ ] **Step 1: Add the live-path imports and gate flag**

At the top of `src/routes/bank.users.tsx`, alongside the existing `DEMO_USERS, saveUsers, useAuth, ENTITIES, type User, type RoleId` import from `@/lib/mock`, add:

```typescript
import { isApiEnabled } from "@/lib/api/client";
import { useUsersQuery, useUserMutations } from "@/lib/api/users";
```

- [ ] **Step 2: Branch the data source inside `BankUsers()`**

Find where the component currently reads from `DEMO_USERS` directly (mock array access). Replace the direct read with a controller branch following the exact pattern from `merchants.tsx`'s `useMerchantsController` (mock query + live query both called unconditionally, branch on the result):

```typescript
const apiEnabled = isApiEnabled("users");
const liveQuery = useUsersQuery(apiEnabled);
const liveMutations = useUserMutations();
// existing mock-path variables (DEMO_USERS-derived) stay as the `: User[]` fallback
const allUsers: User[] = apiEnabled ? (liveQuery.data ?? []) : DEMO_USERS;
```

Scope `allUsers` to the bank — this screen already filters by `entityId` from `useAuth()`; keep that filter applied to whichever source (`allUsers`) is now active, unchanged.

- [ ] **Step 3: Branch the create/update/activate/deactivate handlers**

Wherever the component currently calls `saveUsers()` after mutating `DEMO_USERS` in place, branch:

```typescript
if (apiEnabled) {
  liveMutations.create.mutate({ user: newUser, password, organizationId, teamId });
} else {
  DEMO_USERS.push(newUser);
  saveUsers();
}
```

Apply the same branch shape to update/activate/deactivate, mirroring exactly how `merchants.tsx` branches `useMerchantMutations()` calls vs `cell` mutation.

- [ ] **Step 4: Manual verification**

With `VITE_API_RESOURCES` not including `users`, confirm the screen behaves identically to before (mock path untouched). This is the regression check — no automated test exists for this route; do it by running the dev server and exercising add/edit/activate/deactivate.

Run: `bun run dev`, navigate to `/bank/users`, confirm list renders and add/edit dialogs work exactly as before the change.

- [ ] **Step 5: Commit**

```bash
git add src/routes/bank.users.tsx
git commit -m "feat(api): wire bank.users to live /users (CR-02 unblocked)"
```

### Task 3: Wire `admin.cby-staff` to the live client

**Files:**
- Modify: `src/routes/admin.cby-staff.tsx` (661 lines)

**Interfaces:**
- Consumes: same as Task 2 (`useUsersQuery`, `useUserMutations`, `isApiEnabled`).
- Produces: nothing new.

- [ ] **Step 1: Repeat Task 2's Steps 1-3 for this route**

Same import additions, same `apiEnabled`/`liveQuery`/`liveMutations` branch, same create/update/activate/deactivate mutation branching. This screen additionally reads `entitiesCell`/`orgsCell`/`teamsCell` for org/bank pickers when creating CBY staff (no `entityId` scoping needed — CBY staff aren't bank-scoped) — leave those reads untouched, only the `User[]` source and the mutation calls change.

- [ ] **Step 2: Manual verification**

Run: `bun run dev`, navigate to `/admin/cby-staff`, confirm list renders and add/edit/activate/deactivate work unchanged with `users` absent from `VITE_API_RESOURCES`.

- [ ] **Step 3: Add `users` to `.env` (local verification only — do not commit a flipped `.env`)**

Locally, append `,users` to `VITE_API_RESOURCES` in `.env` (gitignored) and re-run both screens against the local backend from sub-project #1, confirming create/list/activate/deactivate round-trip against the real database.

- [ ] **Step 4: Update `.env.example` to document the new key**

```
# Keys: reference-data, organizations, teams, roles, banks, merchants, reports, audit,
#       notifications, requests, workflows, users
```

(This line already lists `users` per the current `.env.example` — confirm it matches; if `VITE_API_RESOURCES` in `.env.example`'s example value doesn't include `users` yet, add it there too once Tasks 1-3 are verified end-to-end.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.cby-staff.tsx .env.example
git commit -m "feat(api): wire admin.cby-staff to live /users; document users key in .env.example"
```

---

## Part 2 — Sub-project #3: Merchants verification + CR-13 tracking

Bank-scoping is already correct on both frontend and backend (confirmed this session — `MerchantPolicy::canAccessMerchant()` + `MerchantController::index()` bank filter). The only gap is the backend's tax-number uniqueness bug (CR-13, filed in `BACKEND-CHANGE-REQUESTS.md`), which is a backend fix, not frontend code. This sub-project is a verification task, not a build task, until CR-13 ships.

### Task 4: Add a duplicate-tax-number error-surface check to `merchants.ts`

The frontend doesn't need new logic to fix CR-13 (that's backend-side), but it should surface the validation error correctly once the backend scopes it to `bank_id` — confirm the existing error path handles it, and pin a manual regression script for when CR-13 closes.

**Files:**
- Modify: `src/lib/api/merchants.ts` (add a comment marking the CR-13 dependency near `toWriteBody`/`create` mutation, lines 87-120 and 166-170)
- No new file — this is a documentation/verification task, not new code.

**Interfaces:** None changed — `useMerchantMutations().create` already surfaces `ApiError.fields` (from `client.ts`'s `toApiError`) to whatever caller renders form errors; confirm the merchants screen's create-dialog already reads `error.fields?.tax_number` (check `src/routes/admin.merchants.tsx` or wherever the merchant create form lives) and shows it inline. If it doesn't, that's the one real code change in this task.

- [ ] **Step 1: Locate the merchant create-form's error handling**

Run: `grep -n "fields\?.tax_number\|ApiError" src/routes/admin.merchants.tsx` (adjust path if the merchants screen lives elsewhere — confirm via `grep -rn "useMerchantMutations" src/routes/`).

- [ ] **Step 2: If the form doesn't surface `fields.tax_number`, add it**

If the grep in Step 1 shows the create-dialog's `onError` handler does a generic `toast.error(error.message)` without checking `error.fields`, add the field-specific surface, matching whatever pattern the same file already uses for other validation fields (e.g. `name`, `bank_id`). Do not invent a new error-display component — reuse the existing one.

- [ ] **Step 3: Add a code comment marking the CR-13 dependency**

In `src/lib/api/merchants.ts`, above the `create` mutation (around line 166):

```typescript
// CR-13 (backend, open as of 2026-06-25): tax_number uniqueness is currently
// GLOBAL server-side, not scoped to bank_id. Once fixed, a duplicate tax
// number within the SAME bank should 422 with fields.tax_number; a duplicate
// across DIFFERENT banks should succeed. No frontend code change needed for
// the fix itself — this comment is the regression-test reminder.
create: useMutation({
```

- [ ] **Step 4: Write the manual regression script (run once CR-13 ships, not now)**

Document in this plan file's own follow-up note (not a new doc) — when CR-13 closes:
1. Log in as a bank-1 user. Create merchant with `tax_number: "111"`. Expect success.
2. Log in as a bank-2 user. Create a different merchant with `tax_number: "111"`. Expect success (different bank).
3. As the bank-1 user again, create a second merchant with `tax_number: "111"`. Expect `422` with a `tax_number` field error, shown inline on the form (per Step 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/merchants.ts
git commit -m "docs(api): mark CR-13 dependency on merchants.ts; confirm tax_number error surfaces inline"
```

---

## Part 3 — Out of scope for this plan (tracked, not built here)

- **Request runtime** (sub-project #4: create/draft/actions/documents) — depends on confirming CR-06 (requests row enrichment: `workflow_version_id`, `current_stage`, `merchant`) is actually closed server-side; not verified this session. Scope as its own plan once that's confirmed, using `src/lib/api/requests.ts` (already has `useRequestsQuery`/`useWorkflowStagesQuery`) as the base to extend with `useCreateRequestMutation`/`useApplyActionMutation`, replacing the `wfStore`-bound `createInstance()`/`applyAction()` calls in `src/routes/workflows.instances.$id.tsx` and the `requests.new.tsx` redirect.
- **Workflow designer writes** (sub-project #5) and **screen-permissions gate** (sub-project #6) — demoted per PM priority, not cancelled. Revisit after request runtime ships.
- **Mock removal** (sub-project #7) — final step, blocked on everything above.

---

## Self-review notes

- **Spec coverage:** PM priorities #1 (login) and #2 (banks) require no new tasks — already verified working in sub-project #1. #3 (users) = Part 1 (Tasks 1-3). #4 (merchants) = Part 2 (Task 4) for the verification half; the tax-uniqueness fix itself is backend-side (CR-13), correctly out of frontend scope. #5 (requests + stages) is explicitly deferred to a follow-on plan in Part 3, since its backend dependency (CR-06) isn't confirmed closed — building against an unconfirmed contract would mean rework.
- **No placeholders:** every code step above has complete, copy-pasteable TypeScript matching the exact DTO/mapper/hook shape of `roles.ts` and `merchants.ts`. Where a step says "mirror X" it's because the target file's existing code (432-661 lines) is too large to inline wholesale in a plan step without duplicating the entire file — the instruction names the exact pattern and exact file:line region instead.
- **Type consistency:** `User` (from `@/lib/mock`), `useUsersQuery`, `useUserMutations`, `userKeys` names are used consistently across Task 1 (defines them) and Tasks 2-3 (consume them) — checked against the `roles.ts`/`merchants.ts` naming convention (`roleKeys`/`useRoleMutations`, `merchantKeys`/`useMerchantMutations`) for consistency with sibling files.
