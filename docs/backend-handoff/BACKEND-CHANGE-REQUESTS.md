# Backend Change Requests — Import Financing Platform (Yemen Flow Hub API)

**Audience:** Backend team (Laravel 11 + Sanctum + MySQL).
**Author:** Frontend team.
**Last re-audit:** 2026-06-24, live against `https://cby2.ultimate-dev2.com/api/v1` (OpenAPI: `https://cby2.ultimate-dev2.com/docs`, 92 paths / 114 operations). Probed with the seeded admin `admin@cby.gov.ye` (shared password in `seed/DemoDataSeeder.php`).

This is the **complete, prioritized, step-by-step** list of what the backend must change so the frontend can run the platform entirely on the real database (`VITE_API_RESOURCES=*`) instead of mock data. Each item states the **current live behavior** (with evidence), the **expected behavior**, **why it matters**, a **suggested Laravel implementation**, and an **acceptance check**.

> **This document changes nothing in the frontend.** The frontend already integrates resource-by-resource behind `VITE_API_RESOURCES`, falling back to local mock for any unfinished area, so shipping these in any order never breaks the running app. See the classification in [AUDIT.md](AUDIT.md).

## Validation method

Every endpoint below was exercised live. Where live behavior differed from the published OpenAPI, **live behavior is authoritative**. Probe artifacts (junk records) noted under each item — please hard-delete them (the frontend has no hard-delete endpoint for most resources).

## Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Blocks a whole screen/area. Do first. |
| **P1** | Required before its feature can fully ship. |
| **P2** | Quality / correctness / documentation. |

---

## ✅ Resolved since the previous audit (verified live 2026-06-24)

No action needed — listed so the team knows what's confirmed working:

| Was | Now |
|---|---|
| CORS hardcoded to backend origin | **Reflects request origin** — `Access-Control-Allow-Origin: http://localhost:8080`, `credentials: true`. |
| Error envelope had no `code`/`request_id` | **`{ success:false, code, message, errors, request_id }`** — e.g. `code:"UNAUTHENTICATED"`, `code:"VALIDATION_FAILED"`. |
| List envelope was `{ data, meta }` (no `success`) | **`{ success, message, data, meta }`** for lists. |
| User `role` returned `null` | **`role: { id, code, name }`** + `role_label` in `login`/`me`/`users`. |
| Banks omitted swift/license/status | **`license_number`, `swift_code`, `status` returned** (list + detail). |
| No published workflow version | **`IMPORT_FINANCING` v1 PUBLISHED** seeded (`published_version` present). |

---

## A. Blockers — do these first (P0)

### CR-06 · `POST /users` — required `role` string blocks user creation · P0 (CRITICAL)
**Where:** `POST /api/v1/users`.
**Current (live):** the OpenAPI marks `role` (string) as **required** (`required: [name, email, password, role]`) and `role_id` as nullable. The `role` value maps to a global enum that does **not** cover all seeded org roles, so most user types cannot be created. There is **no `users` client in the frontend at all** — the entire user-management screen stays on mock because of this.

**Expected (preferred):** accept **`role_id`** (FK into `roles`) as the canonical role and **drop the required `role` string**. The frontend already holds the org-scoped `role_id`.
**Alternative (if a global role concept must stay):** publish the **complete** `role` enum **and** the `rc_*` (org role code) → global-role mapping, and expose it (e.g. `GET /roles/system`).

**Why:** without this, no user can be created via the API; bank admins, committee members, support, executives, FX/SWIFT users cannot be onboarded. Single biggest remaining blocker.

**Suggested implementation** — FormRequest validating the real table:
```php
public function rules(): array {
    return [
        'name'            => ['required', 'string', 'max:200'],
        'email'           => ['required', 'email', 'unique:users,email'],
        'password'        => ['required', Password::min(8)],
        'organization_id' => ['required', 'exists:organizations,id'],
        'team_id'         => ['required', 'exists:teams,id'],
        'role_id'         => ['required', 'exists:roles,id'],  // canonical role
        'bank_id'         => ['nullable', 'exists:banks,id'],
        'mfa_enabled'     => ['boolean'],
        'is_active'       => ['boolean'],
    ];
}
// Contract: role/team must belong to the user's organization;
// bank_id required iff organization is commercial_banks.
```
**Acceptance:** `POST /users` with only `role_id` (no `role`) creates every seeded role type and returns the created user with `role: {id,code,name}`.

**Cleanup (hard-delete from DB — frontend cannot):** probe users `pr_1_20319@test.local` (id 13), `e_1_3421@t.local` (id 14); junk role **id 9, code `_`** ("مراجع جمركي ١"). Still present from the prior audit.

---

### CR-12 · All `activate/deactivate/suspend` return 406; `DELETE /teams/{id}` returns 500 · P0
**Where:** every `POST /{resource}/{id}/activate|deactivate|suspend`, plus `DELETE /teams/{id}`.
**Current (verified live 2026-06-24):**
```
POST /organizations/4/deactivate -> 406
POST /organizations/4/activate   -> 406
POST /merchants/5/suspend        -> 406
POST /merchants/5/activate       -> 406
DELETE /teams/{id}               -> 500
```
This looks like a content-negotiation / route-format issue (the action routes don't return a JSON response).

**Frontend workaround already shipped:** for resources whose `PATCH` accepts `is_active` (organizations, teams, roles, banks, reference-tables/values) the toggle goes through `PATCH {id} {"is_active": …}` and **works**. **Merchants and Users have NO workaround** — their `POST /{id}/suspend|activate` → 406, and `PATCH /merchants|users/{id}` reject `status`/`is_active` (`"Validation failed."`). So **merchant + user activate/deactivate are fully blocked.**

**Expected:** fix the 406 on all action endpoints (return JSON). **Alternatively** officially support + document `PATCH {is_active}` (governance/reference) and `PATCH {status}` (merchants). For `DELETE /teams/{id}`, return `405` or implement soft-delete instead of `500`.

**Suggested implementation:** ensure each action controller returns `response()->api(...)`; verify the route isn't constrained by a format suffix. For merchants, either fix `suspend`/`activate`, or allow `status` in the merchant `PATCH` FormRequest.
**Acceptance:** toggling status on every governance/reference/**merchant**/**user** screen returns `200`; `DELETE /teams/{id}` returns `405` or soft-deletes.

**Cleanup:** merchant id `6` ("تاجر اختبار probe", tax 9999001); `teams.code = probe_team`; `roles.code = probe_role` (from prior audit).

---

### CR-14 · Workflow Designer — write endpoints entirely missing · P0
**Where:** workflow authoring.
**Current (re-confirmed live):** only **reads + lifecycle** exist. Present: `GET /workflows` (×3), `GET /workflow-versions/{id}` + `clone|validate|publish|archive`, `GET .../stages|transitions|fields|field-groups|graph`, `GET /workflow-actions`, `PUT /stages/{id}/permissions`, `PUT /stages/{id}/field-rules`.

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

**Contract rules:** edits on `DRAFT` versions only; `code`/`key` unique within a version + immutable after use; cannot delete a component referenced by a transition/request; system/default components protected.
**Why:** without these the Workflow Designer screen stays on mock/localStorage. Reads + graph already work, so the read-only published view is already bound.
**Acceptance:** create a full DRAFT version (stages + actions + transitions + fields) via API, `validate`, `publish` end-to-end, with edits rejected after publish.

---

## B. Authentication & permissions (P1)

### CR-08 · Complete the auth surface (MFA, refresh, password) · P1
**Where:** `/auth/*`.
**Current (live):** only `POST /auth/login`, `GET /auth/me`, `GET /auth/me/permissions`, `POST /auth/logout` (Sanctum bearer at `data.token`, `token_type: Bearer`, `mode: token`).
**Missing:**
- `POST /auth/mfa/verify` + an MFA challenge in the `login` response (TOTP was required for phase 1).
- `POST /auth/refresh` — or document that Sanctum tokens are long-lived and no refresh is needed.
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` (self-service; existing `/users/{id}/reset-password` is an admin action).
- Token revocation on user deactivation / sensitive permission change.

**Expected:** document token lifetime + refresh strategy, and implement the missing endpoints. The frontend keeps the access token in memory only (never localStorage).
**Why:** the demo login + RoleSwitcher cannot be removed and real sign-in/MFA/password flows cannot ship without these.
**Acceptance:** login can challenge MFA and verify it; a self-service password change works; token lifetime/refresh is documented.

### CR-09 · Document the permissions payload + how screen/action access is derived · P1
**Where:** `GET /auth/me/permissions`, `GET /screens`, `GET /roles/{id}/screen-permissions`.
**Current (live):** `GET /auth/me/permissions` → `{ screen_permissions: [], capabilities: ["VIEW","CREATE","UPDATE","DELETE","EXPORT","MANAGE"] }`. `capabilities` works for the admin, **but `screen_permissions` is `[]` even for the admin** and its element shape is undocumented (cannot infer from an empty array). `GET /screens` → `[{ id, code, name, is_active }]`.

**Expected:** document, with examples:
- exact shape of `screen_permissions[]` (e.g. `{ screen: "merchants", capabilities: ["VIEW","CREATE"] }`),
- how `capabilities[]` (global) combine with `screen_permissions`,
- **how the frontend decides "can this user create a request?"** — per the original contract this is derived from stage permissions, not a screen capability; specify the field(s) to read.
- populate `screen_permissions` for the admin (and seeded roles) so the gate can be tested.

**Why:** the entire screen-visibility / button-enablement layer is driven by this payload. Without a documented, populated shape the mock permission model cannot be replaced.
**Acceptance:** `me/permissions` returns a non-empty, documented `screen_permissions[]` for the admin; the frontend can gate screens off it.

### CR-16 · Seed default permissions for non-admin roles · P1
**Where:** authorization.
**Current:** the platform admin has full capabilities (reads work). Other seeded roles (bank intake, reviewer, committee, support, executive…) need their default screen/stage permissions to be testable.
**Expected:** seed the default permission matrix per role (see `seed/DemoDataSeeder.php` for the role list), or expose an admin path to set it.
**Acceptance:** each seeded account returns a realistic permission set from `me/permissions`.

---

## C. Per-resource gaps (P1 / P2)

### CR-17 · Enrich the `GET /requests` list row · P1
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
**Why:** the requests list shows the **current stage** column + stage **filter** + **progress**, and the **applicant** column — all render empty in API mode today. This unblocks the full requests list + the request runtime binding.
**Acceptance:** each list row includes `workflow_version_id`, `current_stage`, `merchant`, and a non-null `reference_number`.

### CR-11 · Enforce optimistic locking (`version`) on sensitive updates · P1
**Where:** `PATCH /organizations|teams|roles|banks|merchants|reference-*/{id}`.
**Current:** only `POST /requests/{id}/actions` requires `version`. Governance/merchant/reference `PATCH` neither accept nor check `version`, so concurrent edits silently overwrite. The resources already **return** a `version` field.
**Expected:** accept a required `version`; on mismatch return `409` with `code: "STALE_RESOURCE"`. The frontend already tracks `version` per resource.
```php
trait ChecksVersion {
    protected function assertVersion(Model $m, Request $r): void {
        if ((int) $r->input('version') !== (int) $m->version)
            throw new ApiException('STALE_RESOURCE', 'This record was modified by someone else.', 409);
    }
}
// update(): $this->assertVersion($org, $request); $org->update($data); $org->increment('version');
```
**Acceptance:** a stale `PATCH` returns `409 STALE_RESOURCE`.

### CR-13 · Document nested write payload shapes · P2
**Where:** `POST/PATCH /merchants`, `PUT /stages/{id}/permissions`, `PUT /stages/{id}/field-rules`, `PUT /roles/{id}/screen-permissions`.
**Current:** typed as generic `object` in the spec. The merchant **detail** nests correctly:
```json
"owners":    [{ "id":5, "name":"…", "ownership_percentage":25 }],
"companies": [{ "id":5, "name":"…", "commercial_registration_number":"CR-50052",
               "commercial_registration_expiry":"2026-06-16",
               "sector_reference_value_id":5, "is_active":true }]
```
**Expected:** document the **create/update** request shape for each nested array (same field names as detail). Confirm `merchants` create accepts `owners[]` + `companies[]` with these fields and that `companies[].sector_reference_value_id` is a reference-value id (not a label).
**Acceptance:** creating a merchant with `owners[]` + `companies[]` round-trips to the same fields in the detail response.

### CR-04 · Make OpenAPI match live (typed schemas + examples) · P1
**Where:** the whole spec.
**Current:** many request/response bodies are generic `object`; some required fields are absent or wrong. We had to probe each endpoint to learn the real contract.
**Expected:** every endpoint documents its real request fields (with `required`) + a typed response schema with at least one `example`, so the frontend can generate a typed client (`openapi-typescript`) and stop hand-writing types.
**Acceptance:** `openapi-typescript` generates usable types for governance, merchants, requests, reports.

### CR-18 · Standardize the pagination `meta` shape · P2 (NEW)
**Where:** all list endpoints.
**Current (live):** `meta` is the Laravel paginator default: `{ current_page, last_page, per_page, total, from, to, links[] }`. The agreed contract was `{ page, per_page, total, last_page }`.
**Impact:** **not currently breaking** — no frontend screen reads `meta` fields yet (lists use a large `per_page`). But it diverges from the contract and from CR-01's documented example.
**Expected:** either return the contract shape `{ page, per_page, total, last_page }`, or update the OpenAPI to document the Laravel shape as the official one. Pick one and document it.
**Acceptance:** the documented `meta` shape matches the live `meta` shape exactly.

### CR-05 · New records created `is_active = false` · P2
**Where:** `POST /organizations|teams|roles|banks`.
**Current:** a freshly created record returns `is_active: false`, so it appears inactive until an extra activate call.
**Expected:** default new records to `is_active: true`, **or** document this as intended so the UI prompts activation. Please confirm.

---

## D. Seed & enablement

### CR-15 · ✅ Published workflow version — RESOLVED
`IMPORT_FINANCING` v1 is seeded `PUBLISHED` with a `published_version`. `POST /requests` against it can be built. Kept here for traceability. (Pair with CR-16/CR-17 to fully exercise the Requests screen.)

---

## Summary

| ID | Title | Priority | Blocks | Status |
|---|---|---|---|---|
| CR-06 | `POST /users` role field | P0 | **all user creation** | Open |
| CR-12 | activate/deactivate/suspend → 406 (+team delete 500) | P0 | status toggle (merchant/user fully) | Open |
| CR-14 | Workflow authoring write endpoints | P0 | Workflow Designer | Open |
| CR-08 | Auth completeness (MFA/refresh/password) | P1 | real sign-in | Open |
| CR-09 | Document + populate permissions payload | P1 | screen/action gating | Open |
| CR-16 | Seed non-admin permissions | P1 | testing non-admin roles | Open |
| CR-17 | Enrich `GET /requests` row | P1 | requests list + runtime | Open (partial) |
| CR-11 | Optimistic locking (`version`) | P1 | safe concurrent edits | Open |
| CR-04 | OpenAPI accuracy | P1 | typed client | Open |
| CR-13 | Document nested write payloads | P2 | merchants/permissions writes | Open |
| CR-18 | Standardize `meta` shape | P2 | contract consistency | Open (non-breaking) |
| CR-05 | `is_active` default on create | P2 | UX (confirm intent) | Open |
| CR-01 | Consistent success envelope | P0 | — | ✅ Resolved |
| CR-02 | Error `code` + `request_id` | P0 | — | ✅ Resolved |
| CR-03 | CORS allow frontend origins | P0 | — | ✅ Resolved |
| CR-07 | Return `role` in user payload | P1 | — | ✅ Resolved |
| CR-10 | Banks swift/license/status | P1 | — | ✅ Resolved |
| CR-15 | Seed published workflow version | P1 | — | ✅ Resolved |

**What the frontend can run on the live DB today:** reference data, organizations, roles, banks, audit, reports, notifications (full); teams, merchants, requests-list, workflow-view (partial). **Blocked:** user management (CR-06), workflow authoring (CR-14), screen-permission gating (CR-09), merchant/user status toggle (CR-12).

**Order of work to reach `VITE_API_RESOURCES=*`:** CR-06 → CR-12 → CR-09/CR-16 → CR-17 → CR-14 → CR-08, with CR-04/CR-11/CR-13/CR-18/CR-05 as quality passes.
