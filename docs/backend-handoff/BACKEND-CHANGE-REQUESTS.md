# Backend Change Requests — Import Financing Platform (Yemen Flow Hub API)

**Audience:** Backend team (Laravel 11 + Sanctum + MySQL).

**Author:** Frontend team.

**Audited:** 2026-06-24, live against `https://cby2.ultimate-dev2.com/api/v1` (OpenAPI: `https://cby2.ultimate-dev2.com/docs`, 92 paths / 114 operations). Probed with the seeded admin `admin@cby.gov.ye` (shared password in `seed/DemoDataSeeder.php`).

**Re-verified:** 2026-06-25, against the backend's `feature/import-request-missing-fields` branch (read via a local clone — `backend/`, not modified) plus a fresh pass against the live Swagger and live API. The backend team reported CR-02, CR-03, CR-04 (screen permissions), and the roles work as done; this pass confirms what's actually closed, what's partial, and surfaces a new P0 (CR-13) the backend's own "merchants reviewed" claim missed.

This is the complete, prioritized, step-by-step list of what the backend must change so the frontend can run the platform entirely on the real database (`VITE_API_RESOURCES=*`) instead of mock data. Each item states the **current live behavior** (with evidence), the **expected behavior**, **why it matters**, a **suggested Laravel implementation**, and an **acceptance check**.

## Project-manager priority (overrides CR priority below)

The PM has set the **minimum-viable order** for what must work correctly first, ahead of the rest of this backlog:

1. **Login** (auth)
2. **Bank management** (CRUD)
3. **Users** (CRUD)
4. **Merchant management** — bank-scoped (a bank-1 user must never see bank-2's merchants) and **tax number unique per bank**, not globally (bank 1 and bank 2 can each register a merchant with tax number `111`; bank 1 cannot register two merchants both with `111`)
5. **Request creation and stage progression**

CR-13 (new, below) is the only P0 blocking item against this list — items 1–3 and the bank-scoping half of item 4 are verified working; the tax-uniqueness half of item 4 is not.

> **This document changes nothing in the frontend.** The frontend integrates resource-by-resource behind `VITE_API_RESOURCES`, falling back to local mock for any unfinished area, so shipping these in any order never breaks the running app. See the classification in [AUDIT.md](AUDIT.md).

## Validation method

Every endpoint below was exercised live. Where live behavior differed from the published OpenAPI, **live behavior is authoritative**. Probe artifacts (junk records) are noted under each item — please hard-delete them (the frontend has no hard-delete endpoint for most resources).

## Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Blocks a whole screen/area. Do first. |
| **P1** | Required before its feature can fully ship. |
| **P2** | Quality / correctness / documentation. |

---

## A. Blockers — do these first (P0)

### CR-01 · Workflow Designer — write endpoints are entirely missing · P0

**Where:** workflow authoring.

**Current (live):** only **reads + lifecycle** exist. Present: `GET /workflows` (×3), `GET /workflow-versions/{id}` + `clone|validate|publish|archive`, `GET .../stages|transitions|fields|field-groups|graph`, `GET /workflow-actions`, `PUT /stages/{id}/permissions`, `PUT /stages/{id}/field-rules`.

**Missing entirely** (no create/update/delete):

| Resource | Needed endpoints |
|---|---|
| Definitions | `POST /workflows`, `PATCH /workflows/{id}` |
| Versions | `POST /workflows/{id}/versions`, `PATCH /workflow-versions/{id}` |
| Stages | `POST /workflow-versions/{id}/stages`, `PATCH /stages/{id}`, `DELETE /stages/{id}` |
| Actions | `POST /workflow-actions`, `PATCH /workflow-actions/{id}`, activate/deactivate |
| Transitions | `POST /workflow-versions/{id}/transitions`, `PATCH /transitions/{id}`, `DELETE /transitions/{id}` |
| Fields | `POST /workflow-versions/{id}/fields`, `PATCH /fields/{id}`, `DELETE /fields/{id}` |
| Field groups | `POST /workflow-versions/{id}/field-groups`, `PATCH /field-groups/{id}`, `DELETE /field-groups/{id}` |

**Contract rules to enforce:** edits on `DRAFT` versions only; `code`/`key` unique within a version and immutable after use; cannot delete a component referenced by a transition/request; system/default components protected.

**Why:** without these the Workflow Designer screen stays on mock/localStorage. Reads + the process graph already work, so the read-only published view is already bound.

**Acceptance:** create a full DRAFT version (stages + actions + transitions + fields) via the API, `validate`, then `publish` end-to-end, with edits rejected after publish.

---

### CR-02 · `POST /users` — required `role` string blocks user creation · P0 (CRITICAL) — ✅ CLOSED

**Where:** `POST /api/v1/users`.

**Resolved (verified 2026-06-25 against `backend/` code, branch `feature/import-request-missing-fields`):** `StoreUserRequest` now requires **`role_id`** (FK into `roles`); the legacy `role` string is accepted but optional, kept only for backward compatibility. `UpdateUserRequest` makes `role_id` optional on `PATCH`. This matches the preferred fix below — confirmed via code read, not yet re-confirmed against a fresh live API call (the live Swagger at `cby2.ultimate-dev2.com/docs` does not document `/users` at all — see CR-04 follow-up — but `curl .../api/v1/users` returns `401`, i.e. the route exists live).

**Bank-manager assignment (extra, backend-reported):** `UserController` auto-links a user with a `bank_id` to that bank's organization on create — this is the "add a bank manager from user management" capability the backend mentioned. Verified in code.

**Original ask (for reference):** accept `role_id` as the canonical role and drop the required `role` string, or alternatively publish the complete `role` enum + `rc_*` mapping. The backend took the first path.

**Remaining for the frontend (not a backend item):** build `users.ts` client and wire the user-management screens — no client exists yet. Tracked as sub-project #2 in the local roadmap, not a CR.

**Acceptance (met):** `POST /users` with only `role_id` (no `role`) creates a user; `role_id` is now the validated, required-on-create field.

**Cleanup still pending (hard-delete from DB — the frontend cannot):** probe users `pr_1_20319@test.local` (id 13), `e_1_3421@t.local` (id 14); junk role **id 9, code `_`** ("مراجع جمركي ١"). Please confirm these were removed.

---

### CR-03 · All `activate/deactivate/suspend` return 406; `DELETE /teams/{id}` returns 500 · P0 — ✅ CLOSED

**Where:** every `POST /{resource}/{id}/activate|deactivate|suspend`, plus `DELETE /teams/{id}`.

**Resolved (verified 2026-06-25, code + live Swagger):** every activate/deactivate/suspend controller (`OrganizationController`, `TeamController`, `RoleController`, `BankController`, `MerchantController`, `UserController`) now returns `200` or `403` — confirmed in `backend/` code and re-confirmed live: the public Swagger now documents `200`/`403` for these routes, no more `406`. **Merchant suspend/activate and user activate/deactivate are fixed** — the previously-blocked workaround-less cases.

**`DELETE /teams/{id}`:** the route was **removed**, not fixed — `routes/api.php` has no `DELETE teams/{team}` entry anymore; only `activate`/`deactivate` remain. This matches the alternative this CR offered ("implement soft-delete instead of 500") — deactivate is the supported path now. **No further action needed**, but please confirm this is intentional (not an oversight) so the frontend can stop showing a hard-delete affordance for teams anywhere it still does.

**Extra (backend-added, not requested but welcome):** `RoleController` now blocks deactivating a role that has users assigned (`ROLE_IN_USE`, returns `403`) — see CR-03b below, folded in as a confirmed addition.

**Acceptance (met):** status toggle works on every governance/reference/merchant/user screen; team "delete" is deactivate-only by design.

**Cleanup still pending:** merchant id `6` ("تاجر اختبار probe", tax `9999001`); `teams.code = probe_team`; `roles.code = probe_role`. Please confirm these were hard-deleted.

#### CR-03b · Role cannot be deactivated while linked to users (backend-added) — ✅ confirmed

Not part of the original ask — the backend added this as a data-integrity guard. Verified in code: `RoleController` checks `User::where('role_id', $role->id)->exists()` before allowing deactivate or a `PATCH` that would deactivate, returning `403 ROLE_IN_USE` if any user holds the role. Good addition, no action needed.

---

## B. Authentication & permissions (P1)

### CR-04 · Document and populate the permissions payload · P1 — ⚠️ PARTIALLY RESOLVED

**Where:** `POST /auth/login`, `GET /auth/me`, `GET /auth/me/permissions`, `GET /screens`, `GET /roles/{id}/screen-permissions`.

**Update (live, re-verified 2026-06-24):** `screen_permissions` is now **populated and shaped**. The `login`/`me` user payload returns, e.g. for `intake@ybank.ye` (role `rc_bank_intake`):

```json
"screen_permissions": [ { "screen": "merchants", "capabilities": ["MANAGE"] } ],
"capabilities": ["MANAGE"]
```

So the element shape is confirmed: `{ screen: string, capabilities: ("VIEW"|"CREATE"|"UPDATE"|"DELETE"|"EXPORT"|"MANAGE")[] }`. The frontend can now gate page access off `screen_permissions` (VIEW/MANAGE on the screen's own key).

**`MANAGE` implies all capabilities — confirmed in code:** `PermissionService::userCan()` checks `whereIn('capability', [$capability, 'MANAGE'])`, so a role holding `MANAGE` on a screen passes a `CREATE`/`UPDATE`/`VIEW`/`DELETE` check on that screen. Matches the backend's claim exactly.

**Still open:**

- **The OpenAPI spec is missing entire resources, not just under-typed.** Re-checked live 2026-06-25: `https://cby2.ultimate-dev2.com/docs` documents **no `/users` paths and no `/roles` paths at all** — not generic-`object` bodies, the paths are absent from the spec entirely. The routes exist live (`curl .../api/v1/users` → `401`, not `404`), so this is a documentation-generation gap, not a missing feature. Given users + roles are PM priority items #2/#3, please add these to the OpenAPI generation (route annotations / controller doc-blocks, whatever the generator reads) so the frontend can build a typed `users.ts` client against a real contract instead of reverse-engineering it from `backend/` source.
- Document the `screen_permissions[]` shape officially in the OpenAPI (it was inferred from a live login and from `backend/` source, not the spec).
- Confirm whether `GET /auth/me/permissions` returns the same populated `screen_permissions` (the **login/me user object** does; verify the dedicated permissions endpoint matches).
- Specify **how the frontend decides "can this user create a request?"** — per the original contract this derives from stage permissions, not a screen capability; name the field(s) to read.
- The **supporting-resource read gap** this exposed is split out as **CR-12** (in the Seeding section below).

**Acceptance:** the `screen_permissions[]` shape is documented in the OpenAPI; `/users` and `/roles` appear in the OpenAPI spec with real request/response schemas; `me/permissions` matches the login payload; request-create derivation is specified.

### CR-05 · Complete the authentication surface (MFA, refresh, password) · P1

**Where:** `/auth/*`.

**Current (live):** only `POST /auth/login`, `GET /auth/me`, `GET /auth/me/permissions`, `POST /auth/logout` (Sanctum bearer at `data.token`, `token_type: Bearer`, `mode: token`).

**Missing:**

- `POST /auth/mfa/verify` and an MFA challenge in the `login` response (TOTP was required for phase 1).
- `POST /auth/refresh` — or document that Sanctum tokens are long-lived and no refresh is needed.
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` (self-service; the existing `/users/{id}/reset-password` is an admin action).
- Token revocation on user deactivation / sensitive permission change.

**Expected:** document the token lifetime + refresh strategy, and implement the missing endpoints. The frontend keeps the access token in memory only (never localStorage).

**Why:** the demo login + RoleSwitcher cannot be removed and real sign-in/MFA/password flows cannot ship without these.

**Acceptance:** login can challenge MFA and verify it; a self-service password change works; token lifetime/refresh is documented.

### CR-06 · Enrich the `GET /requests` list row · P1

**Where:** `GET /api/v1/requests`.

**Current (live):** the row added claim fields but still omits stage/version/applicant:

```json
{ "id":1, "reference_number":null, "bank_id":1, "bank_name":"…", "status":"ACTIVE",
  "current_owner_role":null, "is_claimed":false, "can_be_claimed":false,
  "currency":"USD", "amount":120000, "supplier_name":null, "import_type":null,
  "invoice_number":"INV-2026-10000", "created_at":"…" }
```

Missing: **`workflow_version_id`**, **`current_stage: { id, name }`**, **`merchant: { id, name }`** (applicant); and `reference_number` is `null` for seeded requests.

**Expected:** add those fields and populate `reference_number`.

**Why:** the requests list shows the **current stage** column + stage **filter** + **progress**, and the **applicant** column — all render empty in API mode today. This unblocks the full requests list and the request runtime binding.

**Acceptance:** each list row includes `workflow_version_id`, `current_stage`, `merchant`, and a non-null `reference_number`.

### CR-07 · Enforce optimistic locking (`version`) on sensitive updates · P1

**Where:** `PATCH /organizations|teams|roles|banks|merchants|reference-*/{id}`.

**Current:** only `POST /requests/{id}/actions` requires `version`. Governance/merchant/reference `PATCH` neither accept nor check `version`, so concurrent edits silently overwrite. These resources already **return** a `version` field.

**Expected:** accept a required `version`; on mismatch return `409` with `code: "STALE_RESOURCE"`. The frontend already tracks `version` per resource.

```php
trait ChecksVersion {
    protected function assertVersion(Model $m, Request $r): void {
        if ((int) $r->input('version') !== (int) $m->version) {
            throw new ApiException('STALE_RESOURCE', 'This record was modified by someone else.', 409);
        }
    }
}
// update(): $this->assertVersion($org, $request); $org->update($data); $org->increment('version');
```

**Acceptance:** a stale `PATCH` returns `409 STALE_RESOURCE`.

---

## C. Quality & documentation (P2)

### CR-08 · Document nested write payload shapes · P2

**Where:** `POST/PATCH /merchants`, `PUT /stages/{id}/permissions`, `PUT /stages/{id}/field-rules`, `PUT /roles/{id}/screen-permissions`.

**Current:** these are typed as generic `object` in the spec. The merchant **detail** response nests them correctly:

```json
"owners":    [{ "id":5, "name":"…", "ownership_percentage":25 }],
"companies": [{ "id":5, "name":"…", "commercial_registration_number":"CR-50052",
               "commercial_registration_expiry":"2026-06-16",
               "sector_reference_value_id":5, "is_active":true }]
```

**Expected:** document the **create/update** request shape for each nested array (same field names as the detail response). Confirm `merchants` create accepts `owners[]` + `companies[]` with these fields and that `companies[].sector_reference_value_id` is a reference-value id (not a label).

**Acceptance:** creating a merchant with `owners[]` + `companies[]` round-trips to the same fields in the detail response.

### CR-09 · Standardize the pagination `meta` shape · P2

**Where:** all list endpoints.

**Current (live):** `meta` is the Laravel paginator default: `{ current_page, last_page, per_page, total, from, to, links[] }`.

**Impact:** **not currently breaking** — no frontend screen reads `meta` fields yet (lists use a large `per_page`). But it diverges from the documented contract `{ page, per_page, total, last_page }`.

**Expected:** either return the contract shape `{ page, per_page, total, last_page }`, or update the OpenAPI to document the Laravel shape as the official one. Pick one and document it.

**Acceptance:** the documented `meta` shape matches the live `meta` shape exactly.

### CR-10 · Make the OpenAPI spec match the live API (typed schemas + examples) · P2

**Where:** the whole spec.

**Current:** many request/response bodies are generic `object`; some required fields are absent or wrong. We had to probe each endpoint to learn the real contract.

**Expected:** every endpoint documents its real request fields (with `required`) and a typed response schema with at least one `example`, so the frontend can generate a typed client (`openapi-typescript`) and stop hand-writing types.

**Acceptance:** `openapi-typescript` generates usable types for governance, merchants, requests, and reports.

---

## D. Seeding (P1)

### CR-11 · Seed default permissions for non-admin roles · P1

**Where:** authorization.

**Current:** the platform admin has full capabilities (reads work). Other seeded roles (bank intake, reviewer, committee, support, executive…) need their default screen/stage permissions to be testable.

**Expected:** seed the default permission matrix per role (see `seed/DemoDataSeeder.php` for the role list), or expose an admin path to set it.

**Acceptance:** each seeded account returns a realistic permission set from `me/permissions`.

### CR-12 · Grant supporting-resource READ permissions for multi-resource screens · P0

**Where:** authorization seeding / policies for every role that can open a multi-resource screen.

**Symptom (verified live, 2026-06-24):** `intake@ybank.ye` (role `rc_bank_intake`) logs in with `screen_permissions: [{ screen: "merchants", capabilities: ["MANAGE"] }]` — it **can** open the merchants screen. But the screen then 403s on its supporting lookups:

```text
GET /banks?per_page=100             -> 403
GET /reference-tables?per_page=100  -> 403
GET /merchants?per_page=100         -> 403   # verify: must be 200 (user HAS merchants:MANAGE)
```

**Root cause:** several screens are **master + lookup** views — opening them reads more than one resource. The role is granted the **primary** screen permission but **not READ on the lookup resources**, so the lookups 403 and the page (which the user is allowed to see) error-walls.

**The multi-resource map** (frontend, verified) — for each screen, the role that holds the **primary** permission must also get **VIEW/read** on the listed lookup resources:

| Screen | Primary permission (page access) | Lookup resources that must be READable | Lookup used for |
|---|---|---|---|
| Merchants | `merchants` | `banks`, `reference-data` (`reference-tables`) | bank name + bank picker; sector/category dropdown |
| Roles | `roles` | `organizations` | org picker + org label |
| Teams | `teams` | `organizations` | org picker + org label |
| Banks / Entities | `banks` | `organizations` | commercial-banks org id (needed on create) |

**Expected:**

- Granting a role the primary screen permission (e.g. `merchants:VIEW`/`MANAGE`) must also grant **read** on that screen's lookup resources (per the table). Seed this for every non-admin role per CR-11 (above).
- A user who holds `merchants:MANAGE` must get **`200`** from `GET /merchants` (verify the symptom above — `merchants` itself must not 403 for a user who has the merchants permission).

**Important — do NOT widen page access:** lookup READ is **data-read only**. Page visibility stays driven exclusively by `screen_permissions` (VIEW/MANAGE on the screen's own key). Granting read on `banks`/`organizations`/`reference-data` as a lookup must **not** make those screens appear in the user's navigation or pass their `ScreenGuard`. Keep "can read the resource as a lookup" separate from "has the screen permission".

**Why:** without this, every role that can open a multi-resource screen hits a 403 wall on data it legitimately needs to render the page it is allowed to see. This blocks non-admin use of merchants, roles, teams, and banks screens on the live DB.

**Acceptance:** logged in as each non-admin role, opening every screen it has page access to returns `200` for the screen's primary resource **and** all its lookups; and a role **without** a screen's permission still cannot open that screen even though it can read the resource as a lookup elsewhere.

---

## E. New — found during the 2026-06-25 re-verification

### CR-13 · Merchant tax number is unique globally, must be unique per bank · P0 (CRITICAL)

**Where:** `POST /merchants`, `PATCH /merchants/{id}` — uniqueness check on `tax_number`.

**This is a PM-named acceptance criterion** (priority #4 above) that the backend's "merchants reviewed, matches demo" report did not catch.

**Current (verified in `backend/` code, branch `feature/import-request-missing-fields`):** the merchant-creation uniqueness check queries `tax_number` with no `bank_id` filter:

```php
// MerchantController::assertMerchantUniqueness() — current
if ($merchantQuery->where('tax_number', $data['tax_number'])->exists()) {
    abort(ApiResponse::validationError(['tax_number' => ['The tax number has already been taken.']]));
}
```

This means tax number `111` can only ever be used by **one merchant in the entire system** — bank 2 cannot register a merchant with tax number `111` if bank 1 already has, even though the two merchants are unrelated and belong to different banks. There is also no composite unique index on `(bank_id, tax_number)` at the database level — only application-level validation, and that validation is wrong.

**Expected:** scope the uniqueness check to `bank_id`:

```php
// expected
if ($merchantQuery
    ->where('bank_id', $data['bank_id'])
    ->where('tax_number', $data['tax_number'])
    ->exists()) {
    abort(ApiResponse::validationError(['tax_number' => ['This tax number is already used by another merchant at this bank.']]));
}
```

Add a composite unique index `(bank_id, tax_number)` at the DB level as well (matches the existing pattern — `assertMerchantUniqueness` already excludes the current merchant's own id on update, just needs the `bank_id` predicate added). Confirm `PATCH` (update) uses the same scoped check.

**Why:** without this, bank 2 cannot onboard a real merchant whose tax number happens to coincide with one already registered by bank 1 (tax numbers are independent per bank in this domain) — a hard onboarding blocker for any multi-bank tax-number collision, and a regression risk the moment two banks both onboard merchants going forward.

**Acceptance:** bank 1 creates a merchant with `tax_number: "111"` → succeeds. Bank 2 creates a different merchant with `tax_number: "111"` → succeeds (different bank, allowed). Bank 1 attempts a second merchant with `tax_number: "111"` → `422` validation error naming `tax_number`.

**Bank scoping on list/read — confirmed correct, no action needed:** `MerchantController::index()` filters by `bank_id` for bank-role users (`backend/.../MerchantController.php`), and `MerchantPolicy::canAccessMerchant()` blocks cross-bank `show`/`update`/`activate`/`suspend` by id. This part of the PM's requirement is already met.

---

## Summary

| ID | Title | Priority | Status | Blocks |
|---|---|---|---|---|
| CR-01 | Workflow authoring write endpoints | P0 | Open | Workflow Designer |
| CR-02 | `POST /users` role field | P0 | ✅ Closed | all user creation |
| CR-03 | activate/deactivate/suspend → 406 (+team delete) | P0 | ✅ Closed | status toggle (merchant/user fully) |
| CR-03b | Role deactivate blocked while linked to users (backend-added) | — | ✅ Confirmed | data integrity |
| CR-04 | Document + populate permissions payload | P1 | ⚠️ Partial — payload populated, OpenAPI still missing `/users` + `/roles` entirely | screen/action gating, typed client |
| CR-05 | Auth completeness (MFA/refresh/password) | P1 | Open | real sign-in |
| CR-06 | Enrich `GET /requests` row | P1 | Open | requests list + runtime |
| CR-07 | Optimistic locking (`version`) | P1 | Open | safe concurrent edits |
| CR-08 | Document nested write payloads | P2 | Open | merchants/permissions writes |
| CR-09 | Standardize `meta` shape | P2 | Open | contract consistency |
| CR-10 | OpenAPI accuracy | P2 | Open | typed client |
| CR-11 | Seed non-admin permissions | P1 | Open — no `ScreenPermission` seeding found in `DemoDataSeeder` | testing non-admin roles |
| CR-12 | Grant supporting-resource READ for multi-resource screens | P0 | Open — no distinct lookup-read grant found in code | merchants/roles/teams/banks for non-admin roles |
| **CR-13** | **Merchant `tax_number` unique globally — must be unique per bank** | **P0 (new)** | **Open — code confirms global uniqueness** | **merchant onboarding (PM priority #4)** |

**PM minimum-viable order (overrides the CR priority grouping above):** login → bank management → users → merchants (bank-scoped reads ✅ done; tax-number-per-bank ❌ CR-13) → request creation + stage progression.

**What's actually closed as of 2026-06-25:** CR-02 (users `role_id`), CR-03 (status actions + team delete-via-deactivate), CR-03b (role-in-use guard, bonus). CR-04 is half-done — the payload works, the documentation doesn't exist for `/users`/`/roles` at all.

**What's still blocking `VITE_API_RESOURCES=*`:** CR-01 (workflow authoring), CR-06 (request enrichment), CR-11/CR-12 (non-admin permission seeding + lookup reads), and now **CR-13 is the single highest-priority item** — it sits directly on the PM's named acceptance criterion for merchants and was not caught by the backend's own review.

**Order of work (revised):** CR-13 (blocks PM priority #4, quick fix — one query + one index) → CR-12 / CR-11 (non-admin roles unusable without these) → CR-04 OpenAPI gap (needed for any typed client work, including the frontend's planned `users.ts`) → CR-06 (requests) → CR-01 (workflow authoring) → CR-05 (auth), with CR-07/08/09/10 as ongoing quality passes.
