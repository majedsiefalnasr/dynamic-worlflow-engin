# Backend Fixes Handoff — `fix-db` branch

**Date:** 2026-06-25
**Branch:** `fix-db` (from `feature/import-request-missing-fields`)
**Author:** Backend team

This document summarizes all fixes implemented in this branch. The frontend team can use this to update their integration work.

---

## 1. CR-06 — Import Request List/Detail Enrichment (FIXED)

**Files changed:**
- `app/Http/Resources/ImportRequestListResource.php`
- `app/Http/Resources/ImportRequestResource.php`

### What changed

**ImportRequestListResource** now includes 3 new fields:
```json
{
  "workflow_version_id": 1,
  "current_stage": { "id": 3, "name": "المراجعة المساندة" },
  "merchant": { "id": 2, "name": "مجموعة الشيباني" }
}
```

**ImportRequestResource** (detail) now includes 2 new fields:
```json
{
  "workflow_version_id": 1,
  "current_stage": { "id": 3, "name": "المراجعة المساندة" }
}
```
(Detail already had `merchant` with `{id, name, commercial_register}`)

### `reference_number` bug fix

Both resources previously read `$this->reference_number` but the DB column is `reference`. This caused `reference_number` to always return `null`. **Fixed:** both now read `$this->reference` and return it as `reference_number` in the JSON response (key name preserved for frontend compatibility).

### Frontend impact
- `GET /requests` list rows now have `workflow_version_id`, `current_stage`, `merchant` — you can wire the stage column, stage filter, and applicant column.
- `GET /requests/{id}` detail now has `workflow_version_id` and `current_stage`.
- `reference_number` field will now return actual values instead of `null`.
- No eager loading changes needed — `RequestController` already loads `currentStage`, `merchant`, and `bank`.

---

## 2. CR-07 — Optimistic Locking for Banks + Merchants (FIXED)

**Files changed:**
- `app/Http/Controllers/Api/BankController.php`
- `app/Http/Controllers/Api/MerchantController.php`

### What changed

`PATCH /banks/{bank}` and `PATCH /merchants/{merchant}` now **require** a `version` field and check it against the current record version. On mismatch, they return:

```json
HTTP 409
{
  "code": "STALE_RESOURCE",
  "message": "This record was modified by someone else."
}
```

This matches the existing behavior in `UserController`, `OrganizationController`, `RoleController`, and `TeamController`.

### Frontend impact
- Send `version` (integer) in every `PATCH /banks/{id}` and `PATCH /merchants/{id}` request body.
- Handle `409 STALE_RESOURCE` — prompt user to reload and retry.
- `version` was already returned in bank/merchant responses, so no change needed for reading.

### OpenAPI
Both update endpoints now document `version` as required in the request body and `409` as a possible response.

---

## 3. CR-01 Quality — Workflow Designer Fixes (FIXED)

**File changed:** `app/Http/Controllers/Api/WorkflowDesignerController.php`

### 3a. `storeStage` draft guard re-enabled

The immutability check was commented out — stages could be added to PUBLISHED versions. **Fixed:** `POST /workflow-versions/{id}/stages` now returns `403 WORKFLOW_IMMUTABLE_STATE` for non-DRAFT versions.

### 3b. `updateStage` accepts more fields

Previously only accepted `is_initial` and `is_final`. **Now accepts:**
- `name` (string, max 200)
- `description` (string, nullable)
- `sort_order` (integer, min 0)
- `is_initial` (boolean)
- `is_final` (boolean)
- `sla_duration_minutes` (integer, nullable)
- `status` (ACTIVE|INACTIVE)

At least one field must be provided. `code` remains immutable (set at creation only).

### 3c. Draft guard added to `updateStagePermissions` and `updateStageFieldRules`

`PUT /stages/{stage}/permissions` and `PUT /stages/{stage}/field-rules` now enforce `WORKFLOW_IMMUTABLE_STATE` for non-DRAFT versions, matching all other write operations.

### Frontend impact
- Workflow Designer can now fully edit stage properties in DRAFT mode.
- Published versions are properly protected from all modifications.

---

## 4. CR-11 + CR-12 — Screen Permissions for Non-Admin Roles (FIXED)

**File changed:** `database/seeders/DemoDataSeeder.php`

### What changed

Added `seedScreenPermissions()` method that creates `ScreenPermission` records for **all 8 roles**, not just platform admin. The `screen_permissions` table is now truncated and re-seeded on each run.

### Permission matrix

| Role | Primary screens | Lookup screens (VIEW only) |
|---|---|---|
| `rc_platform_admin` | ALL (MANAGE on everything) | — |
| `rc_bank_admin` | merchants(MANAGE), requests(MANAGE), users(VIEW/CREATE/UPDATE), reports(VIEW/EXPORT) | banks, reference_data, organizations, notifications |
| `rc_bank_intake` | merchants(MANAGE), requests(VIEW/CREATE/UPDATE) | banks, reference_data, notifications |
| `rc_bank_reviewer` | requests(VIEW/UPDATE) | merchants, banks, reference_data, notifications |
| `rc_bank_swift` | requests(VIEW/UPDATE) | merchants, banks, notifications |
| `rc_support_member` | requests(VIEW/UPDATE), reports(VIEW/EXPORT) | merchants, banks, reference_data, notifications |
| `rc_executive_member` | requests(VIEW/UPDATE), reports(VIEW/EXPORT) | merchants, banks, notifications |
| `rc_committee_manager` | requests(MANAGE), reports(MANAGE), audit(VIEW) | merchants, banks, users, roles, teams, organizations, reference_data, notifications |

### CR-12 lookup grants

Non-admin roles now get `VIEW` on lookup resources needed by their primary screens:
- **Merchants screen** lookups: `banks` (bank picker), `reference_data` (sector dropdown)
- **Roles/Teams screens** lookups: `organizations` (org picker)
- **Banks screen** lookups: `organizations`

These are data-read only — they do **not** grant page/screen access. Screen visibility is still driven by the primary screen permission (e.g., a bank_intake user has `VIEW` on `banks` as a lookup but does NOT see the Banks management screen in navigation — the frontend should check `screen_permissions` for `MANAGE` or `CREATE`/`UPDATE` to show management screens, and `VIEW` is sufficient for read-only access like dropdown population).

### Frontend impact
- Non-admin logins will now return populated `screen_permissions` from `POST /auth/login` and `GET /auth/me`.
- All lookup API calls (e.g., `GET /banks?per_page=100` from the merchants screen) will return `200` instead of `403` for authorized roles.
- **Re-run the seeder** after deploying: `php artisan db:seed --class=DemoDataSeeder`

---

## 5. Bug Fix — Wrong table name in `bankInUse()` and `merchantHasRequests()` (FIXED)

**Files changed:**
- `app/Http/Controllers/Api/BankController.php`
- `app/Http/Controllers/Api/MerchantController.php`

### What changed

Both methods used raw `DB::table('import_requests')` queries, but the `ImportRequest` model declares `$table = 'requests'`. The `Schema::hasTable('import_requests')` check was silently returning `false`, causing the in-use guard to never trigger — banks and merchants with active requests could be deleted or suspended.

**Fixed:** Changed all `import_requests` references to `requests` in both methods.

### Frontend impact
- `DELETE /banks/{id}` and `POST /merchants/{id}/suspend` will now correctly return `403 BANK_IN_USE` / `403 MERCHANT_HAS_ACTIVE_REQUESTS` when the resource has active import requests.

---

## 6. CR-14 — Route Model Binding Fix for `GET /requests/{id}` (FIXED)

**Files changed:**
- `routes/api.php`
- `app/Http/Controllers/Api/RequestController.php`

### Root cause

The route parameter was `{request}`, which Laravel bound to the `$request` parameter (type `Illuminate\Http\Request`) instead of the `$requestModel` parameter (type `ImportRequest`). This meant `$requestModel` was always a fresh, empty `ImportRequest` — all fields `null`.

### What changed

- Route parameter renamed from `{request}` to `{importRequest}` in all 8 request routes (`show`, `draft`, `action`, `storeDocument`, `showDocument`, `destroyDocument`, `history`, `graph`).
- Controller method parameter renamed from `$requestModel` to `$importRequest` to match the route binding.
- OpenAPI `@OA\Parameter` annotations updated to match.

### Verified working

```
GET /api/v1/requests/1
→ { "id": 1, "reference_number": "IMP-2026-2001", "supplier_name": "Cargill Inc.", "merchant": { "id": 1, "name": "شركة هائل سعيد أنعم" }, "current_stage": { "id": 1, "name": "إنشاء الطلب" }, ... }
```

All per-request operations now work: detail view, draft save, action execution, document upload/download, history, graph.

### Frontend impact
- `GET /requests/{id}` now returns real data instead of all nulls.
- `PATCH /requests/{id}/draft`, `POST /requests/{id}/actions`, document endpoints, and `GET /requests/{id}/history` all work correctly.
- **No URL change needed** — the route path is still `/requests/{id}` from the frontend's perspective; only the internal Laravel parameter name changed.
- **PM priority #5 (request detail + stage progression) is unblocked.**

---

## 7. Migration — Detail Columns Added to `requests` Table (NEW)

**File added:** `database/migrations/2026_06_25_000001_add_detail_columns_to_requests_table.php`

### What changed

Added 8 nullable columns to the `requests` table:

| Column | Type | Purpose |
|---|---|---|
| `supplier_name` | string | Supplier/exporter company name |
| `import_type` | string | Goods category (e.g., مواد غذائية) |
| `country_of_origin` | string | Country of origin |
| `goods_description` | text | Description of goods |
| `port_of_entry` | string | Arrival port |
| `payment_terms` | string | Payment terms |
| `invoice_date` | date | Invoice date |
| `shipping_port` | string | Shipping port |

**Model updated:** `app/Models/ImportRequest.php` — added all 8 columns to `$fillable` and `invoice_date` to `casts` (as `date`).

### Frontend impact
- `ImportRequestListResource` already returns `supplier_name` and `import_type` — they were returning `null` before because the columns didn't exist. Now populated.
- `ImportRequestResource` (detail) already returns all 8 fields — now populated with real data.
- No frontend code changes needed — these fields were already in the API response shape, just always `null`.

---

## 8. Seeder Enrichment — Full Request Data (UPDATED)

**File changed:** `database/seeders/DemoDataSeeder.php`

### What changed

| Aspect | Before | After |
|---|---|---|
| `data` JSON per request | 8 fields | 32 fields (all dynamic form fields) |
| Dedicated columns | Only `amount`, `currency`, `invoice_number` | + `supplier_name`, `import_type`, `country_of_origin`, `goods_description`, `port_of_entry`, `payment_terms`, `invoice_date`, `shipping_port` |
| Merchant details in `data` | Not included | `taxNumber`, `linkedCompany`, `commercialRegistration`, `owners` per merchant |
| `requestIdentifier` in `data` | Not included | `IMP-2026-XXXX` (detail page title) |
| Request #13 invoice | `INV-2026-10132` (unique) | `INV-2026-10022` (duplicate of #3 — tests duplicate invoice warning) |
| Transition IDs in history | Missing (always `null`) | Properly looked up from seeded transitions |
| `clearDemoTables()` | Only truncated governance + merchants | Now truncates all seeded tables (requests, history, workflow, audit, etc.) |

### Seeded request distribution (16 requests)

| Stage | Count | Status |
|---|---|---|
| CREATE | 2 | ACTIVE |
| INTERNAL | 2 | ACTIVE |
| SUPPORT | 2 | ACTIVE |
| EXEC | 2 | ACTIVE |
| FX | 2 | ACTIVE |
| FX_CONFIRM | 2 | ACTIVE |
| FINAL | 1 | ACTIVE |
| CLOSED | 3 | 2 CLOSED + 1 REJECTED |

### Frontend impact
- Request list and detail pages will show complete data for all 16 seeded requests.
- Dynamic form fields (`data` JSON) are fully populated — no more empty/partial forms in read-only stages.
- Duplicate invoice warning can be tested: requests #3 (`IMP-2026-2003`, INTERNAL) and #13 (`IMP-2026-2013`, FINAL) share `INV-2026-10022`.

---

## 9. CR-15 — Missing `data` and `version` Fields on Request Resources (FIXED)

**Files changed:**
- `app/Http/Resources/ImportRequestResource.php`
- `app/Http/Resources/ImportRequestListResource.php`

### Root cause

Both resources returned dedicated DB columns (`supplier_name`, `invoice_number`, etc.) but never exposed the raw `data` JSON blob or the `version` optimistic-locking counter, even though:
- `data` holds all 32 dynamic workflow form fields (not all of which are promoted to dedicated columns) — the frontend's dynamic form renderer needs this to render engine-configured fields.
- `version` is required by the frontend to send back on `PATCH /requests/{id}/draft` and `POST /requests/{id}/actions` for optimistic locking (`409 STALE_RESOURCE` on mismatch) — this check already existed server-side in `RequestController`, but the client had no way to read the current version.

### What changed

Added two keys to both resources' `toArray()`:
```json
{
  "data": { "taxNumber": "...", "importerName": "...", "...": "... (32 fields)" },
  "version": 1
}
```

### Verified working

```
GET /api/v1/requests/1       → version: 1, data: {32 keys}
GET /api/v1/requests?per_page=3 → each row has version + data (32 keys)
```

### Frontend impact
- Dynamic form rendering can now read all engine-configured fields from `data` on both list and detail views.
- `version` is now available to send back on `PATCH /requests/{id}/draft` and `POST /requests/{id}/actions` — stale-write detection (`409 STALE_RESOURCE`) is fully functional end-to-end now that the client can read the current version.

---

## 10. CR-04 — `me/permissions` OpenAPI Typed (FIXED)

**File changed:** `app/Http/Controllers/Api/AuthController.php`

### What changed

`GET /auth/me/permissions` response now has a fully typed OpenAPI schema: `screen_permissions[].screen` (string), `screen_permissions[].capabilities[]` (enum of `VIEW|CREATE|UPDATE|DELETE|EXPORT|MANAGE`), and `capabilities[]` (union across all screens). Previously undocumented — the shape was only inferable from a live login response.

### Verified working

Live-confirmed `me/permissions` for `intake@ybank.ye` returns the same `screen_permissions` shape as `login`/`me`:
```json
{"screen_permissions":[{"screen":"merchants","capabilities":["MANAGE"]}, ...],"capabilities":["VIEW","MANAGE","CREATE","UPDATE"]}
```

### Frontend impact
- `me/permissions` contract is now typed in the OpenAPI spec — safe to generate a typed client against it.

---

## 11. CR-08/CR-09/CR-10 — OpenAPI Accuracy + Pagination Meta (FIXED)

**Files changed:**
- `app/Support/ApiResponse.php` (CR-09)
- `app/Http/Controllers/Api/MerchantController.php` (CR-08)
- `app/Http/Controllers/Api/WorkflowDesignerController.php` (CR-08)
- `app/Http/Controllers/Api/RolePermissionController.php` (CR-08)

### CR-09 — pagination `meta` shape unified

`ApiResponse::normalizeSuccessPayload()` had two code paths producing different `meta` shapes: the manual `LengthAwarePaginator` path (used by `requests`, `audit-logs`) already returned `{page, per_page, total, last_page}`, but the `Resource::collection($paginator)` path (used by `banks`, `merchants`, `organizations`, `roles`, `teams`, `users`, `notifications`) returned Laravel's default `{current_page, last_page, per_page, total, from, to, links[]}`. Fixed by normalizing the collection path's resolved `meta` to the same 4-key shape.

**Verified live:** `GET /banks?per_page=2` and `GET /requests?per_page=2` now both return `{page, per_page, total, last_page}` exactly.

### CR-08 — nested write payloads typed

Replaced generic `OA\Items(type: 'object')` placeholders with full typed item schemas matching each endpoint's actual validation rules:
- `POST /merchants`, `PATCH /merchants/{id}` — `owners[]` (`name`, `ownership_percentage`), `companies[]` (`name`, `commercial_registration_number`, `commercial_registration_expiry`, `sector_reference_value_id`, `is_active`).
- `PUT /stages/{id}/permissions` — `permissions[]` (`organization_id`, `team_id`, `role_id`, `user_id`, `access_level`, `display_label`).
- `PUT /stages/{id}/field-rules` — `field_rules[]` (`field_id`, `is_visible`, `is_editable`, `is_required`).
- `PUT /roles/{id}/screen-permissions` — `permissions` documented as a `{screen_code: capability[]}` map via `additionalProperties` (the example was already correct; this is a genuinely dynamic-keyed object, not under-typed).

### CR-10 — remaining generic-object audit

After the CR-08 fixes, the only remaining `type: 'object'` properties in the spec are `requests` `data` (dynamic per-workflow-version schema — no fixed shape exists by design, matches the `ImportRequest.data` JSON column) and `reports/exports` `filters` (free-form query filter bag). Both are correctly modeled as open objects, not documentation gaps.

### Frontend impact
- `openapi-typescript` now generates concrete item types for merchant `owners[]`/`companies[]` and stage `permissions[]`/`field_rules[]` instead of `Record<string, unknown>`.
- All list endpoints' `meta` shape is now contract-consistent — safe to read `meta.page`/`meta.last_page` from any list response.

---

## 12. CR-16 — Bank-Scoped Admin Saw Zero Requests (FIXED)

### Root cause
`WorkflowService::canUserSeeRequest()` required a matching `StagePermission` row (org/team/role/user) on the request's current stage for **every** access level, including plain `VIEW`. Seeded stage permissions only target the team actually performing that stage's work (e.g. `team_entry` on stage 1) — `team_admin_bank` has no stage permission row anywhere, so bank admins were structurally invisible to all requests even though the `bank_id` equality check (already present) was correct.

### What changed
`app/Services/Workflow/WorkflowService.php::canUserSeeRequest` — bank-role users now get `VIEW` access whenever `bank_id` matches, without needing a stage-permission row. `EXECUTE` (used by `GET /requests/my-queue`) still requires the real stage permission, so per-stage work-queue gating is unaffected.

```php
if ($user->role?->isBankRole()) {
    if ((int) $user->bank_id !== (int) $request->bank_id) {
        return false;
    }

    if (strtoupper($accessLevel) === 'VIEW') {
        return true;
    }
}
```

### Verified working
`admin@ybank.ye` (`bank_id: 1`) → `GET /requests` → `total: 7` (was `0`), all 7 rows confirmed `bank_id: 1`. Platform admin still sees `total: 16` (unaffected).

**Cross-bank isolation:** seeded a second bank-scoped admin, `admin@tsib.ye` (`bank_id: 2`, role `rc_bank_admin`) in `DemoDataSeeder.php`, to give the negative test a real account. `GET /requests` for `admin@tsib.ye` → `total: 6`, all rows `bank_id: 2` — confirms a bank-1 user never sees bank-2's requests and vice versa.

### Frontend impact
Request list/queue screens now populate for bank-side roles (intake, reviewer, swift, support, exec, admin) — previously empty for every bank user.

---

## 13. CR-17 — `version` Missing on Bank/Merchant Read Responses (FIXED)

### Root cause
CR-07 enforced `version` on `PATCH /banks/{id}` and `PATCH /merchants/{id}` (422 if missing, 409 if stale), but `BankResource`/`MerchantResource` never projected the column on read — same absent-not-null gap CR-15 had for requests.

### What changed
```php
// app/Http/Resources/BankResource.php
'version' => $this->version,

// app/Http/Resources/MerchantResource.php
'version' => $this->version,
```

### Verified working
`GET /banks`, `GET /banks/{id}`, `GET /merchants`, `GET /merchants/{id}` all return `version: 1` (matching the DB column) on every row.

### Frontend impact
Bank/merchant edit forms can now read the current `version` and round-trip it on `PATCH`, completing the optimistic-locking flow CR-07 already enforced server-side.

---

## What's still open

| CR | Status | Notes |
|---|---|---|
| CR-01 | **Closed** (all write endpoints exist + quality fixes applied) | No DELETE for definitions/versions (archive is the path) |
| CR-04 | **Closed** | `screen_permissions` shape now typed in OpenAPI; live-confirmed matches login payload |
| CR-05 | **Open** | Auth surface: no MFA, refresh, forgot/reset/change password |
| CR-08 | **Closed** | Nested write payloads (merchants owners/companies, stage permissions/field-rules) now typed |
| CR-09 | **Closed** | Pagination `meta` shape unified across both response-building paths |
| CR-10 | **Mostly closed** | Generic `object` types fixed where they were under-typed; `data`/`filters` correctly left open by design |
| CR-14 | **Closed** | Route model binding fixed — all per-request endpoints work |
| CR-15 | **Closed** | `data` and `version` now exposed on both list and detail request resources |
| CR-16 | **Closed** | Bank-role `VIEW` no longer requires stage-permission match; bank admins see own-bank requests |
| CR-17 | **Closed** | `version` now exposed on bank/merchant list and detail responses |

---

## Files modified (summary)

```
app/Http/Resources/ImportRequestListResource.php          — CR-06
app/Http/Resources/ImportRequestResource.php              — CR-06
app/Http/Controllers/Api/BankController.php               — CR-07, bug fix #5
app/Http/Controllers/Api/MerchantController.php           — CR-07, bug fix #5
app/Http/Controllers/Api/WorkflowDesignerController.php   — CR-01 quality
app/Http/Controllers/Api/RequestController.php            — CR-14 (route model binding)
app/Models/ImportRequest.php                              — new columns in $fillable + invoice_date cast
routes/api.php                                            — CR-14 (route param rename)
database/migrations/2026_06_25_000001_add_detail_columns_to_requests_table.php — new migration
database/seeders/DemoDataSeeder.php                       — CR-11/CR-12 + enriched seed data + CR-16 (bank-2 admin user for isolation testing)
app/Http/Resources/ImportRequestListResource.php          — CR-15 (data + version)
app/Http/Resources/ImportRequestResource.php              — CR-15 (data + version)
app/Http/Controllers/Api/AuthController.php               — CR-04 (me/permissions typed)
app/Support/ApiResponse.php                                — CR-09 (pagination meta unified)
app/Http/Controllers/Api/RolePermissionController.php     — CR-08 (screen-permissions typed)
app/Services/Workflow/WorkflowService.php                 — CR-16 (bank-role VIEW visibility)
app/Http/Resources/BankResource.php                        — CR-17 (version on read)
app/Http/Resources/MerchantResource.php                    — CR-17 (version on read)
```

## Deployment steps

1. Pull the `fix-db` branch
2. Run migrations: `php artisan migrate`
3. Re-seed demo data: `php artisan db:seed --class=DemoDataSeeder`
4. Regenerate OpenAPI: `php artisan l5-swagger:generate`

## PM Priority Status

| Priority | Item | Status |
|---|---|---|
| 1 | Login (auth) | Working |
| 2 | Bank management (CRUD) | Working |
| 3 | Users (CRUD) | Working |
| 4 | Merchant management (bank-scoped + tax unique per bank) | Working |
| 5 | Request creation and stage progression | **Unblocked** (CR-14 fixed, all per-request endpoints work) |
