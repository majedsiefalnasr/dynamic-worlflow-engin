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

## What's still open

| CR | Status | Notes |
|---|---|---|
| CR-01 | **Closed** (all write endpoints exist + quality fixes applied) | No DELETE for definitions/versions (archive is the path) |
| CR-04 | **Mostly closed** | OpenAPI annotations exist for users + roles. Still need: document `screen_permissions` shape in OpenAPI |
| CR-05 | **Open** | Auth surface: no MFA, refresh, forgot/reset/change password |
| CR-08 | **Open** | Document nested write payload shapes |
| CR-09 | **Open** | Standardize pagination `meta` shape |
| CR-10 | **Open** | OpenAPI accuracy (generic `object` types remain in some places) |

---

## Files modified (summary)

```
app/Http/Resources/ImportRequestListResource.php    — CR-06
app/Http/Resources/ImportRequestResource.php        — CR-06
app/Http/Controllers/Api/BankController.php         — CR-07
app/Http/Controllers/Api/MerchantController.php     — CR-07
app/Http/Controllers/Api/WorkflowDesignerController.php — CR-01 quality
database/seeders/DemoDataSeeder.php                 — CR-11/CR-12
```

## Deployment steps

1. Pull the `fix-db` branch
2. Run migrations if any pending: `php artisan migrate`
3. Re-seed demo data: `php artisan db:seed --class=DemoDataSeeder`
4. Regenerate OpenAPI: `php artisan l5-swagger:generate`
