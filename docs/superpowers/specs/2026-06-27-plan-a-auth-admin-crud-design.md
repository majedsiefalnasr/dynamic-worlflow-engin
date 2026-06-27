# Plan A — Auth + User Type Evolution + Admin CRUD

**Date:** 2026-06-27
**Branch:** `live2`
**Depends on:** Foundation + template resource (complete)
**Status:** Awaiting review

## 1. Scope

Wire 7 concerns to the live backend, following the adapter pattern established by
the `reference-data` template:

1. **Auth** — login, session rehydrate, logout, global 401 handling
2. **User type evolution** — align `User` domain type to backend `UserResource`
3. **Screen permissions** — wire backend permission matrix to existing guards
4. **Organizations** — admin CRUD + status toggle
5. **Teams** — admin CRUD + status toggle
6. **Roles** — admin CRUD + status toggle
7. **Banks** — admin CRUD + status toggle (maps to frontend `Entity`)
8. **Users** — admin + bank-user CRUD + status toggle

### Non-goals (deferred to Plans B & C)

- Merchants, reports, audit, notifications (Plan B)
- Requests, workflows (Plan C)
- Profile self-edit (piggybacks on users adapter, Plan B or standalone)

## 2. Auth Adapter

**File:** `src/lib/data/auth.ts`

Auth is NOT a resource in the `source()` switch — it is gated by `hasApiBase()`
from `http.ts`. If a base URL is set, auth is live; otherwise mock.

### 2.1 Login (live mode)

```
User enters email + password → OTP step (pre-filled, non-functional placeholder)
→ submit triggers POST /auth/login { email, password }
→ response: { success, message, data: { user: UserResource, token, token_type, mode } }
→ tokenStore.set(data.token)
→ map UserResource DTO → domain User
→ auth.login(mappedUser)
→ syncWorkflowUser(mappedUser)
→ navigate to "/"
```

On failure: `mapHttpError` → `DomainError`. Login screen shows `error.message` via
toast. 422 = bad credentials; 403 = inactive account; 429 = rate limited.

### 2.2 Login (mock mode)

Current behavior unchanged: demo picker → fake OTP → `auth.login(demoUser)`.

### 2.3 Login screen changes

The login screen (`src/routes/login.tsx`) gains a source branch:

- **Live mode** (`hasApiBase() === true`): email + password form → OTP step
  (pre-filled, decorative) → submit calls `authAdapter.login(email, password)`.
  The demo-user picker and `DEMO_USERS` import disappear.
- **Mock mode** (`hasApiBase() === false`): current behavior, unchanged.

This is a **required UI change** — recorded in `UI-CHANGES.md` as UC-01.

### 2.4 Session rehydration (live mode)

On app start (in `__root.tsx`'s `RootLayout`, before `AuthGate` renders), if
`tokenStore.get()` returns a token:

1. `GET /auth/me` → map `UserResource` → `auth.login(user)` + `syncWorkflowUser(user)`
2. On 401 → `tokenStore.clear()`, stay on `/login`
3. On network error → stay on `/login` (offline)

This runs once, before the first render of `AuthGate`. While loading, the app shows
a full-screen spinner (same pattern as reference-data's loading guard).

### 2.5 Logout (live mode)

```
AppShell logout handler:
→ POST /auth/logout (fire-and-forget, don't block on response)
→ tokenStore.clear()
→ auth.logout()
→ navigate to "/login"
```

Mock mode: current behavior (just `auth.logout()` + navigate).

### 2.6 Global 401 handling

When any `api.*` call returns 401, `http.ts` already maps it to
`DomainError{kind:"unauthorized"}`. Add a response interceptor:

- On 401: `tokenStore.clear()` → `auth.logout()`
- The existing `AuthGate` in `__root.tsx` handles the redirect to `/login`

This runs in `http.ts` at the `request()` level so all adapters benefit.

### 2.7 RoleSwitcher (mock-only)

The `RoleSwitcher` component is hidden when `hasApiBase()` is true. It only makes
sense for demo mode. Recorded in `UI-CHANGES.md` as UC-02.

## 3. User Type Evolution

The frontend `User` type (`src/lib/mock.ts`) must evolve to match the backend
`UserResource` shape. This is a cross-cutting change affecting ~18 files.

### 3.1 New User type

```ts
export type User = {
  id: number;
  name: string;
  email: string;
  roleId: string;        // role.code — e.g. "rc_bank_admin"
  roleLabel: string;     // role.name — Arabic display label
  role: { id: number; code: string; name: string } | null;
  organization: { id: number; code: string; name: string } | null;
  team: { id: number; code: string; name: string } | null;
  bank: { id: number; code: string; name: string } | null;
  bankId: number | null;
  isActive: boolean;
  avatar: string;        // computed: first char of first + last name
  phone?: string;
  screenPermissions: ScreenPermission[];
  capabilities: string[];
  _version?: number;
};

export type ScreenPermission = {
  screen: string;
  capabilities: string[];
};
```

### 3.2 Field mapping from UserResource DTO

| Backend field | Frontend field | Transform |
|---|---|---|
| `id` (int) | `id` (number) | direct |
| `name` | `name` | direct |
| `email` | `email` | direct |
| `role.code` | `roleId` | extract |
| `role.name` | `roleLabel` | extract |
| `role` | `role` | direct nested object |
| `organization` | `organization` | direct nested object |
| `team` | `team` | direct nested object |
| `bank` | `bank` | direct nested object |
| `bank_id` | `bankId` | direct |
| `is_active` | `isActive` | direct |
| — | `avatar` | compute from `name` (initials) |
| — | `phone` | not in UserResource — set `undefined` |
| `screen_permissions` | `screenPermissions` | camelCase keys |
| `capabilities` | `capabilities` | direct |
| `version` | `_version` | rename |

### 3.3 Removed concepts

- **`ROLE_LABELS`** — removed. Every usage becomes `user.roleLabel` or
  `role.name` from the roles adapter. The hardcoded map in `mock.ts` is
  replaced by a function that reads `roleCatalogCell` for mock mode.
- **`entityId`** — replaced by `bankId` and `bank` nested object.
- **`org`** (flat string) — replaced by `organization` nested object.
  Display sites use `user.organization?.name ?? "—"`.
- **`orgKind`** — replaced by `organization?.code` for org-type lookups, or
  by a new `getOrgKindFromUser(user)` helper that derives it from
  `organization?.code` or `organization?.id` via the `orgsCell` lookup.
- **`teamId`** (string) — replaced by `user.team?.id` (number) and
  `user.team?.code` for code-based lookups.

### 3.4 DEMO_USERS update

`DEMO_USERS` array in `mock.ts` is updated to the new shape. All fields
populated to match what the live DTO would return. `id` becomes numeric,
nested objects added, `avatar` computed.

### 3.5 Cross-cutting file updates

Every file that reads `User` fields needs updating. The changes are
mechanical — field renames, not logic changes:

| Pattern | Replacement |
|---|---|
| `user.entityId` | `user.bankId` or `user.bank?.id` |
| `user.org` | `user.organization?.name ?? "—"` |
| `user.orgKind` | derive from org lookup or `user.organization?.code` |
| `user.teamId` | `user.team?.id` or `user.team?.code` |
| `ROLE_LABELS[user.roleId]` | `user.roleLabel` |
| `user.active` | `user.isActive` |
| `type RoleId` import | keep — still `string` (role.code) |

Files affected (from grep):
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/login.tsx`
- `src/routes/profile.tsx`
- `src/routes/workflows.index.tsx`
- `src/routes/workflows.instances.$id.tsx`
- `src/routes/bank.users.tsx`
- `src/routes/admin.cby-staff.tsx`
- `src/routes/admin.roles.tsx`
- `src/routes/admin.orgs.tsx`
- `src/routes/admin.teams.tsx`
- `src/routes/admin.entities.tsx`
- `src/routes/admin.screen-permissions.tsx`
- `src/routes/merchants.tsx`
- `src/routes/notifications.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/workflow/RoleGuard.tsx`
- `src/components/workflow/RoleSwitcher.tsx`
- `src/components/workflow/ScreenGuard.tsx`
- `src/lib/workflow-bridge.ts`
- `src/lib/mock.ts`
- `src/lib/governance.ts`

### 3.6 workflow-bridge.ts update

`wfUserFromAccount(user)` maps a `User` to the workflow engine's `WfUser`.
Update to read from the new nested fields:

```ts
export function wfUserFromAccount(user: User): WfUser {
  return {
    id: String(user.id),
    name: user.name,
    roleCode: user.roleId,          // was user.roleId (unchanged)
    teamCode: user.team?.code,       // was user.teamId
    bankCode: user.bank?.code,       // was user.entityId
    orgCode: user.organization?.code // was user.orgKind
  };
}
```

## 4. Screen Permissions Wiring

### 4.1 Backend shape

`GET /auth/me` returns `screen_permissions` on the user:
```json
[{ "screen": "users", "capabilities": ["VIEW", "MANAGE"] }]
```

`GET /v1/admin/role-permissions` returns the full matrix:
```json
{
  "roles": [{ "id": 1, "code": "rc_platform_admin", "name": "..." }],
  "screens": [{ "id": 1, "code": "users", "name": "..." }],
  "permissions": { "1": { "users": ["VIEW", "MANAGE"] } }
}
```

`POST /v1/admin/role-permissions/toggle`:
```json
{ "role_id": 2, "screen_code": "users", "capability": "VIEW", "enabled": true }
```

### 4.2 Integration approach

**RoleGuard** — stays as-is. Checks `user.roleId` against an `allow` array
of role codes. This works because `roleId` is still `role.code`.

**ScreenGuard** — currently reads `screenPermsCell` + `canScreen()`. In live
mode, `canScreen()` reads from the user's `screenPermissions` array instead
of the cell. The cell is hydrated from the full permission matrix for the
admin screen-permissions editor.

**Admin screen-permissions screen** — gets a `screen-permissions` adapter
(`src/lib/data/screen-permissions.ts`) that:
- Reads: `GET /v1/admin/role-permissions` → maps to local matrix shape
- Writes: `POST /v1/admin/role-permissions/toggle` per toggle

This adapter hydrates `screenPermsCell` in live mode for sync helper compat.

## 5. Admin CRUD Resources

Each resource follows the reference-data template exactly. Below are the
resource-specific details.

### 5.1 Organizations (`src/lib/data/organizations.ts`)

**Domain type:** `OrgRecord` (from `governance.ts` — keep existing type, add
`_version`).

**Backend DTO (OrganizationResource):**
```json
{
  "id": 1, "version": 1, "code": "bank", "name": "...",
  "category": "bank", "category_label": "...",
  "is_system": true, "is_active": true,
  "created_at": "...", "updated_at": "..."
}
```

**Mapping:** `id` → string (to match existing `OrgRecord.id` which is the
`code`). Actually — the frontend `OrgRecord.id` IS the code string
("bank", "committee", "platform"), not a numeric ID. The backend `id` is
numeric. We need to decide: use backend `code` as the domain `id` (matching
current behavior) or evolve `OrgRecord` to numeric IDs.

**Decision:** Evolve `OrgRecord` to match backend. `id` becomes `number`,
add `code` field. Same pattern as User evolution.

```ts
export type OrgRecord = {
  id: number;
  code: string;        // "bank", "committee", "platform"
  label: string;       // name
  category: OrgCategory;
  active: boolean;
  builtin: boolean;    // is_system
  _version?: number;
};
```

Sync helpers (`getOrgLabel`, `getOrgCategory`, `activeOrgs`) update to use
`code` instead of `id` for lookups where external code passes a code string.

**Hooks:**
- `useOrganizations(): ReadResult<OrgRecord[]>`
- `useOrgMutations(): { createOrg, updateOrg, toggleOrg, deleteOrg }`

**Cell:** `orgsCell` hydrated in live mode.

**Screen:** `admin.orgs.tsx` rewired to use adapter hooks.

**Status toggle:** `PATCH /organizations/{id} { is_active: false }` as
workaround for WAF-blocked `POST /deactivate` (BH-01).

### 5.2 Teams (`src/lib/data/teams.ts`)

**Domain type:** `TeamRecord` (from `governance.ts` — evolve to match backend).

**Backend DTO (TeamResource):**
```json
{
  "id": 1, "version": 1, "code": "team_entry", "name": "...",
  "organization": { "id": 1, "code": "bank", "name": "..." },
  "organization_id": 1,
  "is_system": true, "is_active": true,
  "created_at": "...", "updated_at": "..."
}
```

**Evolved type:**
```ts
export type TeamRecord = {
  id: number;
  code: string;
  label: string;
  orgId: number;         // organization_id
  orgCode: string;       // organization.code (for compatibility with orgKind lookups)
  roleCode?: string;     // NOT in backend DTO — kept for mock compat, derived in live
  active: boolean;
  builtin: boolean;
  _version?: number;
};
```

**Note:** Backend `TeamResource` does NOT include a `roleCode` field. The
frontend mock data hardcodes a 1:1 team→role mapping. In live mode, this
mapping may not exist or may be N:M. The `roleCode` field becomes optional
and is only populated in mock mode. Live mode screens that need team→role
should read it from the backend or accept it's not available.

**Hooks:**
- `useTeams(): ReadResult<TeamRecord[]>`
- `useTeamMutations(): { createTeam, updateTeam, toggleTeam, deleteTeam }`

**Cell:** `teamsCell` hydrated in live mode.
**Screen:** `admin.teams.tsx` rewired.
**Status toggle:** PATCH workaround (BH-01).

### 5.3 Roles (`src/lib/data/roles.ts`)

**Backend DTO (RoleResource):**
```json
{
  "id": 1, "version": 1, "code": "rc_platform_admin", "name": "...",
  "organization": { "id": 1, "code": "platform", "name": "..." },
  "organization_id": 1,
  "is_system": true, "is_active": true,
  "created_at": "...", "updated_at": "..."
}
```

**Evolved type:**
```ts
export type RoleCatalogEntry = {
  id: number;
  code: string;          // "rc_platform_admin"
  name: string;
  orgId: number;         // organization_id
  orgCode: string;       // organization.code
  active: boolean;
  builtin: boolean;
  _version?: number;
};
```

**Hooks:**
- `useRoles(): ReadResult<RoleCatalogEntry[]>`
- `useRoleMutations(): { createRole, updateRole, toggleRole, deleteRole }`

**Cell:** `roleCatalogCell` hydrated in live mode.
**Screen:** `admin.roles.tsx` rewired.
**Status toggle:** PATCH workaround (BH-01).

### 5.4 Banks (`src/lib/data/banks.ts`)

**Backend DTO (BankResource):**
```json
{
  "id": 1, "name": "...", "code": "ybank",
  "license_number": "...", "swift_code": "...",
  "status": "active", "version": 1,
  "created_at": "...", "updated_at": "..."
}
```

The frontend calls these "entities" (`Entity` type in `mock.ts`,
`admin.entities.tsx` screen). We keep the screen name but evolve the type:

```ts
export type BankEntity = {
  id: number;
  code: string;
  name: string;
  licenseNumber?: string;
  swiftCode?: string;
  status: "active" | "inactive" | "suspended";
  _version?: number;
};
```

**Note:** The existing `Entity` type has `active: boolean`. Backend uses
`status: string`. Map `status === "active"` → `active: true` for compat.

**Hooks:**
- `useBanks(): ReadResult<BankEntity[]>`
- `useBankMutations(): { createBank, updateBank, toggleBank, deleteBank }`

**Cell:** `entitiesCell` hydrated in live mode.
**Screen:** `admin.entities.tsx` rewired.
**Status toggle:** PATCH workaround (BH-01).

### 5.5 Users (`src/lib/data/users.ts`)

**Hooks:**
- `useUsers(filters?): ReadResult<User[]>` — list users, filterable by
  `bank_id`, `role_id`, `is_active`, search query
- `useUserMutations(): { createUser, updateUser, toggleUser, deleteUser }`

**Cell:** No existing cell — `DEMO_USERS` is a mutable array. In mock mode,
the adapter wraps `DEMO_USERS` mutations. In live mode, `api.get/post/patch`.

**Screens:** Both `admin.cby-staff.tsx` (all users) and `bank.users.tsx`
(bank-scoped users) use the same adapter with different filters.

**Status toggle:** `POST /users/{id}/activate` and `POST /users/{id}/deactivate`.
If WAF blocks these (BH-01), use `PATCH /users/{id} { is_active }`.

## 6. Global Constraints

All constraints from the foundation spec (§2–§3.6) remain in force:

1. **No source branching in UI** — screens never check `apiEnabled`, env,
   or `source()`. The adapter decides.
2. **UI branches on `error.kind` only** — never on HTTP status or error codes.
3. **Adapter independence** — no adapter imports another adapter.
4. **Keys via factory** — `<resource>Keys` factory, never inline strings.
5. **No behavior change** — mock mode is identical to current app behavior.
6. **Mock is default** — without `VITE_API_BASE_URL`, everything is mock.
7. **Data layer in `src/lib/data/`** — all adapters live there.
8. **Cell-as-cache** — live adapter hydrates cells for sync helper compat.
9. **Blocked writes** — WAF-blocked operations use PATCH workaround or
   reject with `DomainError{kind:"blocked"}`.
10. **All Arabic** — error messages, loading text in Arabic.

## 7. Backend Handoff Items

| # | Resource | Type | Detail |
|---|----------|------|--------|
| BH-01 | status-toggle | infra | WAF blocks `POST /activate\|deactivate` — existing, using PATCH workaround |
| BH-03 | teams | missing field | `TeamResource` has no `role_code` — frontend mock assumes 1:1 team→role. Live mode cannot derive this. If needed, backend should add `role_code` to TeamResource or provide a team-role mapping endpoint. |
| BH-04 | users | missing field | `UserResource` has no `phone` field. If needed for profile display, backend should add it. |

## 8. UI-CHANGES.md Items

| # | Screen | Change | Why |
|---|--------|--------|-----|
| UC-01 | login | Live mode: real email/password form replaces demo picker; OTP step stays as decorative placeholder | Demo picker can't work against real backend; email/password is the auth flow |
| UC-02 | AppShell | RoleSwitcher hidden when `hasApiBase()` is true | Demo-only feature; switching users against a real backend is not meaningful |

## 9. Testing

Same rules as foundation spec §10:

- **Mapper tests** for each DTO→domain mapping function
- **Key factory** test per resource
- **Build gates:** `tsc`, `eslint`, `vitest run`, `vite build` after each task
- **No test for every CRUD adapter** — only for risky logic

## 10. Type Evolution Strategy

The governance domain types (`OrgRecord`, `TeamRecord`, `RoleCatalogEntry`)
evolve to match backend shapes. This means `id` changes from `string` to
`number` for orgs, teams, and roles.

**Migration approach:** Update the type, then fix all type errors. The cell
default data updates to use numeric IDs. Mock seed data gets new numeric IDs
(1, 2, 3...) alongside `code` fields that match the old string IDs.

**Sync helper impact:** Functions like `getOrgLabel(id)` currently accept
string IDs. After evolution, they accept `number | string` or the signature
changes. External callers pass `user.organization?.code` (string) or
`org.id` (number) — the helper needs to handle both during migration or
callers update to use `code`.

**Decision:** Sync helpers accept `code: string` as the lookup key (not
numeric `id`). This keeps all existing call sites working and matches how
the UI thinks about orgs ("bank", "committee", "platform"). The `id` field
is numeric for API operations; `code` is for human-readable lookups.

## 11. File Inventory

New files:
- `src/lib/data/auth.ts` — auth adapter
- `src/lib/data/organizations.ts` — orgs adapter
- `src/lib/data/teams.ts` — teams adapter
- `src/lib/data/roles.ts` — roles adapter
- `src/lib/data/banks.ts` — banks adapter
- `src/lib/data/users.ts` — users adapter
- `src/lib/data/screen-permissions.ts` — permissions adapter
- Tests for mapper/key factories: `auth.test.ts`, `organizations.test.ts`, etc.

Modified files:
- `src/lib/mock.ts` — User type evolution, DEMO_USERS update, ROLE_LABELS removal
- `src/lib/governance.ts` — OrgRecord/TeamRecord/RoleCatalogEntry evolution
- `src/lib/workflow-bridge.ts` — User field mapping update
- `src/lib/data/http.ts` — 401 interceptor
- `src/routes/login.tsx` — live/mock login branch
- `src/routes/__root.tsx` — session rehydration
- `src/routes/admin.orgs.tsx` — rewire to adapter
- `src/routes/admin.teams.tsx` — rewire to adapter
- `src/routes/admin.roles.tsx` — rewire to adapter
- `src/routes/admin.entities.tsx` — rewire to adapter
- `src/routes/admin.cby-staff.tsx` — rewire to adapter
- `src/routes/bank.users.tsx` — rewire to adapter
- `src/routes/admin.screen-permissions.tsx` — rewire to adapter
- ~10 more files for User field renames (§3.5)
- `src/components/layout/AppShell.tsx` — logout wiring, RoleSwitcher hide
- `src/components/workflow/RoleSwitcher.tsx` — hide in live mode
- `src/components/workflow/ScreenGuard.tsx` — permission source switch
- `docs/backend-handoff/UI-CHANGES.md` — UC-01, UC-02
- `docs/backend-handoff/BACKEND-HANDOFF.md` — BH-03, BH-04
