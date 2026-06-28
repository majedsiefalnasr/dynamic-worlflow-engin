# DemoDataSeeder — Live-Schema Realign

**Date:** 2026-06-28
**Scope:** `backend/database/seeders/DemoDataSeeder.php` (surgical patch)
**Status:** Design — awaiting user review

---

## 1. Problem

`DemoDataSeeder.php` (931 lines) already mirrors the mock dataset and has been run on the
live backend. But per the seeder's own README (note 2, flagged red), the workflow / requests
/ notifications / field sections were authored from **`07-data-model.md` guesses**, never
verified against the real database schema.

We now have the authoritative schema: `cby_imports_v3.sql` — a full dump (36 `CREATE TABLE`
statements + live rows) of the live `cby_imports` database. Comparing it to the seeder reveals
**concrete schema mismatches that will break a fresh seed run** on the current live DB.

The single confirmed hard failure: `seedRequests()` writes 8 columns onto the `requests` row
that **do not exist** in the live schema.

## 2. Sources of Truth (decided)

| What | Source | Notes |
|---|---|---|
| **Schema** (tables, columns, types) | `cby_imports_v3.sql` `CREATE TABLE` | Authoritative. Override `07-data-model.md` on conflict. |
| **Data** (the demo dataset) | `src/lib/mock.ts` + `src/lib/workflow-engine/seed.ts` | Current frontend mock. Preserve all demo scenarios. |
| **Fallback rows** | `cby_imports_v3.sql` INSERT rows | Only where the mock has no equivalent entity. |

The seeder **reproduces the mock dataset, mapped onto the live schema**. It does NOT copy
live production rows wholesale.

## 3. Approach

**A) Surgical patch** (chosen over full rewrite). The seeder's dataset is already correct
and idempotent; only schema columns are wrong. Fix the column mismatches; keep data + structure.
Smallest diff, lowest regression risk, easiest for the backend team to review.

## 4. Exact Fixes

### 4.1 `requests` table — REMOVE 8 non-existent columns (the hard failure)

**Live `requests` schema (15 cols):**
`id, workflow_version_id, current_stage_id, reference, status, created_by, bank_id,
merchant_id, data, amount, currency, invoice_number, version, created_at, updated_at`

**Current seeder writes (lines ~835–857)** — these columns are ABSENT in live and will throw:
`supplier_name`, `import_type`, `country_of_origin`, `goods_description`, `port_of_entry`,
`payment_terms`, `invoice_date`, `shipping_port`.

**Fix:** delete those 8 keys from the `WorkflowRequest::firstOrCreate` second argument.
All that data is **already** captured in the `$fullData` JSON (lines 800–833) which is written
to the `data` column — nothing is lost. The `::create` call keeps only columns that exist:
`workflow_version_id, current_stage_id, status, created_by, bank_id, merchant_id, amount,
currency, invoice_number, data, created_at`.

**Migration `2026_06_25_000001_add_detail_columns_to_requests_table.php`:** exists in the
clone but **never ran on live** (live schema lacks the columns). Decision: **drop the columns
from the seeder** so it runs on current live, AND flag this migration in the README as
"run on live to promote these fields to first-class columns". Forward-compatible either way —
the values live in `data` JSON until the migration runs.

### 4.2 Verify each remaining section's columns against `cby_imports_v3.sql`

For every `::firstOrCreate` / `::create` in the seeder, confirm every key matches a column in
the dump. Confirmed-correct so far (no change needed):

- `organizations` (9): `code, name, category, is_system, is_active, version` ✓
- `teams` (9), `roles` (9), `banks` (10): `license_number, swift_code, status, version` ✓
- `users` (15): `organization_id, team_id, role_id, bank_id, name, email, phone, password,
  is_active, mfa_enabled, mfa_secret, version` ✓
- `merchants` (12) + `merchant_owners` (6) + `merchant_companies` (9): ✓
- `notifications` (9) + `notification_recipients` (7): ✓
- `audit_logs` (20): `correlation_id, event_code, actor_user_id, entity_type, metadata,
  ip_address, user_agent` ✓
- `field_definitions` (24): `key, label, type, options, reference_table_id, dynamic_source,
  field_group_id, is_system` ✓ — but verify the model casts `options` to JSON/array.
- `stage_permissions` (10): `display_label, access_level` ✓
- `workflow_history` (11): `request_id, from_stage_id, to_stage_id, action_id, transition_id,
  performed_by, comment, data_snapshot` ✓

To be re-checked during implementation (look up `$fillable` in each model vs dump column list):
`field_definitions` (24 cols — seeder only sets ~8; confirm required/non-null cols like
`sort_order` have values), `workflow_stages` (`sla_duration_minutes`, `status` non-null?),
`workflow_versions` (`published_at` format).

### 4.3 Mock-data → live-schema mapping decisions

These are inconsistencies **inside the mock** that the realign must resolve:

1. **Bank code.** `BANK_ENTITIES` uses `ybrd/tsib/sbai`; user objects use `ybank`.
   README + seeder use `ybrd`. **Keep `ybrd/tsib/sbai`** (matches `BANK_ENTITIES`, the bank
   master list). Document the divergence.
2. **Org category enum.** Mock org codes are `bank/committee/platform`; live `organizations`
   has `category` enum (`banks/national_committee/other` per memory) + auto-generated `code`.
   Seeder already maps the enum. **Confirm exact valid category values** against the dump's
   `category` column definition + any existing rows before finalizing.
3. **Merchant IDs.** Mock uses string `m1..`; live `merchants.id` is int auto-increment.
   Seeder must not hardcode IDs — use `firstOrCreate` by `tax_number`.
4. **Reference-number column name.** Live uses `reference` (NOT `reference_number`).
   Seeder already uses `reference` ✓.
5. **Audit action labels.** Mock AUDIT uses Arabic text ("تسجيل دخول"); seeder maps to
   `event_code` enum (`AUTH_LOGIN` etc.) ✓. Keep the mapping table.

## 5. What Does NOT Change

- Dataset (12 users, 3 banks, 8 roles, 8 teams, 5 merchants, 5 notifications, 1 published
  workflow version, 16 requests, 25 audit logs, full field definitions).
- All login accounts + password (`Password@123`).
- Idempotency strategy (`firstOrCreate` by unique keys; `clearDemoTables()` truncates first).
- The "duplicate invoice" demo scenario (request #13 reuses `INV-2026-10022`).
- Swagger demo token + constants.

## 6. Verification

1. `php -l database/seeders/DemoDataSeeder.php` — syntax clean.
2. **Schema diff pass:** programmatically extract every column key the seeder writes, diff
   against the `cby_imports_v3.sql` column set; assert zero unknown columns. (Done during
   implementation — produces a report.)
3. Idempotency: run twice on a local DB mirroring live schema; second run is a no-op
   (no duplicate rows, no errors).
4. Backend team runs on live/staging; confirm no column errors.

Local run requires a DB matching live schema — either import `cby_imports_v3.sql` into the
local MySQL (`127.0.0.1:3307/cby_imports`) or run the migrations + seeder fresh. Out of scope
to run here unless user provides working local DB access.

## 7. Out of Scope

- Role-permission matrix (CR-09/CR-16) — backend grants; seeder only seeds
  `screen_permissions` rows.
- Report chart fixtures (`MONTHLY`, `CATEGORY_DIST`) — computed server-side, never seeded.
- Any endpoint/write work (CR-14 etc.) — seeder writes directly to DB, bypassing endpoints.
- Frontend changes — mock data is the source; no frontend edits.

## 8. Risks

- **Local can't reproduce** without a live-matching DB → verification leans on schema-diff
  + backend run. Mitigated by the column-diff report (deterministic).
- **Model `$fillable` may forbid** some dump columns (e.g. `version` managed by boot logic),
  causing mass-assignment exceptions even with a correct column name. Mitigation: check each
  model's `$fillable`/`$guarded` during implementation; use `forceFill()` only if a column is
  intentionally not fillable.
- **`options` JSON cast** on `field_definitions` — if the model doesn't cast it, the array
  insert fails. Confirm the cast.
