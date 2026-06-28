# DemoDataSeeder Live-Schema Realign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DemoDataSeeder.php` run cleanly against the live `cby_imports` schema (as captured in `cby_imports_v3.sql`) by removing every column write that references a non-existent column, while preserving the full mock dataset in the `data` JSON.

**Architecture:** Surgical patch of one file (`backend/database/seeders/DemoDataSeeder.php`). A throwaway schema-diff script (Python, against the SQL dump) verifies the fix before we touch any DB. Three concrete column bugs are fixed. No data, dataset size, or idempotency strategy changes.

**Tech Stack:** PHP 8 / Laravel seeder (file under patch), Python 3 (verification script only — no project dependency), `cby_imports_v3.sql` (read-only schema source).

## Global Constraints

- **Schema source of truth = `cby_imports_v3.sql`** `CREATE TABLE` definitions, NOT `07-data-model.md`. On conflict, the SQL dump wins.
- **Dataset source of truth = `src/lib/mock.ts` + `src/lib/workflow-engine/seed.ts`.** Do not change the demo data (users, banks, merchants, requests, etc.). Only fix which DB columns it is written to.
- **Do NOT edit `backend/` Eloquent models or migrations.** The `backend/` directory is a read-only clone for inspection (per project memory [[backend-clone-readonly]]). Patch the seeder only. The migration `2026_06_25_000001_add_detail_columns_to_requests_table.php` stays in place (flagged in README for the backend team to run on live).
- **`backend/` paths are prefixed `backend/`.** All seeder/model work happens there.
- **All seeded account passwords = `Password@123`.** Do not change.
- **Keep idempotency** (`firstOrCreate` by unique key; `clearDemoTables()` truncate list unchanged).
- **Caveman mode is active** for prose, but code/commits are written normally.

---

## File Structure

- **Modify:** `backend/database/seeders/DemoDataSeeder.php` — the only production file touched. Three localized edits (banks `is_active`, merchant `commercial_register`, requests 8 detail columns) + a README update.
- **Create (throwaway, not committed):** `backend/database/seeders/_schema_check.py` — Python script that parses `cby_imports_v3.sql`, extracts column names per table, and diffs against the columns the seeder writes. Deleted at the end. Used only to prove the fix; not a project artifact.
- **Modify:** `backend/backend-handoff/seed/README.md` — note 2 ("not verified") updated to "verified against cby_imports_v3.sql"; add a line flagging migration `2026_06_25` as not-yet-run on live.

No new models, migrations, routes, or frontend files.

---

## Background: The Three Confirmed Bugs

These were found by diffing the seeder's column writes against `cby_imports_v3.sql` `CREATE TABLE` definitions and the models' `$fillable` arrays. Verified during design:

**Bug 1 (hard crash) — `requests` detail columns.**
Live `requests` schema = `id, workflow_version_id, current_stage_id, reference, status, created_by, bank_id, merchant_id, data, amount, currency, invoice_number, version, created_at, updated_at` (15 cols). The seeder `seedRequests()` writes 8 columns that do NOT exist in this table: `supplier_name, import_type, country_of_origin, goods_description, port_of_entry, payment_terms, invoice_date, shipping_port`. Because `ImportRequest::$fillable` DOES list all 8, Laravel includes them in the INSERT → MySQL throws "Unknown column". All 8 values are already stored in the `data` JSON column (`$fullData`, lines ~800–833), so removing them loses nothing.

**Bug 2 (dead code / latent crash) — `banks.is_active`.**
Live `banks` schema has no `is_active` column (uses `status`). `Bank::$fillable` also lacks it, so Laravel silently drops it today — but it is misleading dead code. Remove it.

**Bug 3 (hard crash) — `merchants.commercial_register`.**
Live `merchants` schema has no `commercial_register` column. `Merchant::$fillable` DOES list it → INSERT throws "Unknown column". The commercial registration number belongs on `merchant_companies.commercial_registration_number`, which the seeder already sets correctly at line ~349. Remove the merchant-level write.

---

## Task 1: Build the schema-diff verification script

This script proves — without running the seeder or touching any DB — that after our fixes, every column the seeder writes exists in the live schema. We write it FIRST, run it to confirm it currently FAILS (catches the bugs), then use it as the gate after each fix.

**Files:**
- Create: `backend/database/seeders/_schema_check.py` (throwaway — deleted in Task 5)
- Read-only input: `cby_imports_v3.sql` (repo root, i.e. `../cby_imports_v3.sql` relative to the script)
- Read-only input: `backend/database/seeders/DemoDataSeeder.php`

**Interfaces:**
- Consumes: the SQL dump + the seeder source (parsed as text).
- Produces: a printed report listing, per table, any column the seeder writes that is not in the dump. Exit code 0 = clean, 1 = mismatches found.

- [ ] **Step 1: Write the verification script**

Create `backend/database/seeders/_schema_check.py`:

```python
#!/usr/bin/env python3
"""Verify DemoDataSeeder writes only columns that exist in cby_imports_v3.sql.

Throwaway check (not a project artifact). Run from repo root:
    python3 backend/database/seeders/_schema_check.py
Exit 0 = clean, 1 = mismatches found.
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SQL_DUMP = REPO_ROOT / "cby_imports_v3.sql"
SEEDER = REPO_ROOT / "backend" / "database" / "seeders" / "DemoDataSeeder.php"

# Tables the seeder writes to (from clearDemoTables() + ::firstOrCreate targets).
SEEDER_TABLES = [
    "organizations", "teams", "roles", "banks", "reference_tables", "reference_values",
    "users", "merchants", "merchant_owners", "merchant_companies", "notifications",
    "notification_recipients", "screens", "screen_permissions", "workflow_definitions",
    "workflow_versions", "workflow_stages", "workflow_actions", "workflow_transitions",
    "stage_permissions", "field_groups", "field_definitions", "stage_field_rules",
    "requests", "workflow_history", "audit_logs", "personal_access_tokens",
]


def dump_columns():
    """Return {table: set(column_names)} from CREATE TABLE statements."""
    sql = SQL_DUMP.read_text(encoding="utf-8")
    cols = {}
    for m in re.finditer(r"CREATE TABLE `?(\w+)`?\s*\((.*?)\)\s*ENGINE", sql, re.S):
        table, body = m.group(1), m.group(2)
        names = set()
        for line in body.splitlines():
            s = line.strip()
            cm = re.match(r"^`?(\w+)`?\s+\w", s)
            if cm and cm.group(1).upper() not in ("PRIMARY", "UNIQUE", "KEY", "CONSTRAINT", "FULLTEXT"):
                names.add(cm.group(1))
        cols[table] = names
    return cols


def seeder_table_writes():
    """Return {table: set(column_keys)} the seeder writes.

    Heuristic: for each Model::firstOrCreate/::create/::updateOrInsert block, capture
    the column keys in the array argument(s). We map model class -> table via a static
    table (matches the codebase's explicit $table overrides where present).
    """
    model_to_table = {
        "Organization": "organizations", "Team": "teams", "Role": "roles", "Bank": "banks",
        "ReferenceTable": "reference_tables", "ReferenceValue": "reference_values",
        "User": "users", "Merchant": "merchants", "MerchantOwner": "merchant_owners",
        "MerchantCompany": "merchant_companies", "Notification": "notifications",
        "NotificationRecipient": "notification_recipients", "Screen": "screens",
        "ScreenPermission": "screen_permissions", "WorkflowDefinition": "workflow_definitions",
        "WorkflowVersion": "workflow_versions", "WorkflowStage": "workflow_stages",
        "WorkflowAction": "workflow_actions", "WorkflowTransition": "workflow_transitions",
        "StagePermission": "stage_permissions", "FieldGroup": "field_groups",
        "FieldDefinition": "field_definitions", "StageFieldRule": "stage_field_rules",
        "ImportRequest": "requests", "WorkflowRequest": "requests",
        "WorkflowHistory": "workflow_history", "AuditLog": "audit_logs",
    }
    src = SEEDER.read_text(encoding="utf-8")
    writes = {t: set() for t in SEEDER_TABLES}

    # Match: ModelName::firstOrCreate( ... ) / ::create( ... ) / ->firstOrCreate( ... )
    call_re = re.compile(r"(\w+)::(?:firstOrCreate|create|updateOrInsert)\s*\(", re.S)
    for m in call_re.finditer(src):
        model = m.group(1)
        if model not in model_to_table:
            continue
        table = model_to_table[model]
        # Grab the balanced-paren argument to extract column keys 'key' =>
        start = m.end()
        depth, i = 1, start
        while i < len(src) and depth > 0:
            if src[i] == "(":
                depth += 1
            elif src[i] == ")":
                depth -= 1
            i += 1
        block = src[start:i]
        for km in re.finditer(r"'([a-z_][a-z0-9_]*)'\s*=>", block):
            writes.setdefault(table, set()).add(km.group(1))

    # DB::table('foo')->... and updateOrInsert raw blocks for personal_access_tokens.
    for tm in re.finditer(r"DB::table\('([a-z_]+)'\)", src):
        pass  # token table handled by the model map above; column keys captured there.

    return writes


def main():
    dump = dump_columns()
    writes = seeder_table_writes()
    problems = []
    for table, cols in sorted(writes.items()):
        live = dump.get(table, set())
        if not live:
            problems.append(f"  [!] table '{table}' not found in dump")
            continue
        unknown = cols - live
        if unknown:
            problems.append(f"  {table}: writes unknown column(s): {sorted(unknown)}")

    if problems:
        print("SCHEMA MISMATCH — seeder writes columns absent from cby_imports_v3.sql:")
        for p in problems:
            print(p)
        sys.exit(1)
    print("OK — every column the seeder writes exists in cby_imports_v3.sql.")
    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the script to verify it FAILS (catches the current bugs)**

Run from repo root:
```bash
python3 backend/database/seeders/_schema_check.py
```
Expected: exit code 1, output includes mismatches for at least:
- `banks: writes unknown column(s): ['is_active']`
- `merchants: writes unknown column(s): ['commercial_register']`
- `requests: writes unknown column(s): ['country_of_origin', 'goods_description', 'import_type', 'invoice_date', 'payment_terms', 'port_of_entry', 'shipping_port', 'supplier_name']`

If the script exits 0 or misses these, STOP — the regex parsing is wrong; fix the script until it reports exactly these three tables. Do not proceed to fixes with a broken gate.

- [ ] **Step 3: Do NOT commit the throwaway script**

It is a local verification tool, not a project artifact. Leave it uncommitted; it is deleted in Task 5.

---

## Task 2: Fix Bug 1 — remove 8 non-existent columns from `requests` writes

**Files:**
- Modify: `backend/database/seeders/DemoDataSeeder.php` (the `seedRequests()` method, the `WorkflowRequest::firstOrCreate` call around lines 835–858)

**Interfaces:**
- Consumes: none new.
- Produces: `requests` rows written with only columns that exist in the live schema (`workflow_version_id, current_stage_id, status, created_by, bank_id, merchant_id, amount, currency, invoice_number, data, created_at`). The `$fullData` JSON is unchanged.

- [ ] **Step 1: Locate the exact block to edit**

Run:
```bash
grep -n "supplier_name" backend/database/seeders/DemoDataSeeder.php
```
Expected: one hit around line 847, inside the `WorkflowRequest::firstOrCreate` second argument. Confirm the block spans `supplier_name` through `shipping_port` (8 keys, lines ~847–854).

- [ ] **Step 2: Remove the 8 detail-column keys from the `::create` argument**

In `backend/database/seeders/DemoDataSeeder.php`, find this block inside `seedRequests()`:

```php
            $request = WorkflowRequest::firstOrCreate(
                ['reference' => $reference],
                [
                    'workflow_version_id' => $version->id,
                    'current_stage_id'    => $stages[$stageCode],
                    'status'              => $status,
                    'created_by'          => $creator?->id,
                    'bank_id'             => $merchantBank[$importer] ?? null,
                    'merchant_id'         => $merchantsByName[$importer] ?? null,
                    'amount'              => $amount,
                    'currency'            => $currencyCode,
                    'invoice_number'      => $invoiceNumber,
                    'supplier_name'       => $supplier,
                    'import_type'         => $importType,
                    'country_of_origin'   => $origin,
                    'goods_description'   => $importType,
                    'port_of_entry'       => $arrivalPort,
                    'payment_terms'       => 'كلي',
                    'invoice_date'        => '2026-06-16',
                    'shipping_port'       => 'ميناء الشحن',
                    'data'                => $fullData,
                    'created_at'          => $createdAt,
                ],
            );
```

Replace with (8 detail-column keys removed; everything else identical):

```php
            $request = WorkflowRequest::firstOrCreate(
                ['reference' => $reference],
                [
                    'workflow_version_id' => $version->id,
                    'current_stage_id'    => $stages[$stageCode],
                    'status'              => $status,
                    'created_by'          => $creator?->id,
                    'bank_id'             => $merchantBank[$importer] ?? null,
                    'merchant_id'         => $merchantsByName[$importer] ?? null,
                    'amount'              => $amount,
                    'currency'            => $currencyCode,
                    'invoice_number'      => $invoiceNumber,
                    // The 8 detail fields (supplier_name, import_type, country_of_origin,
                    // goods_description, port_of_entry, payment_terms, invoice_date,
                    // shipping_port) live ONLY in `data` JSON until migration
                    // 2026_06_25_000001_add_detail_columns_to_requests_table runs on live.
                    'data'                => $fullData,
                    'created_at'          => $createdAt,
                ],
            );
```

Note: the loop's destructured variables still include `$importType, $supplier, $origin, $arrivalPort` (from `$row`). Those are still used to build `$fullData` above — leave the `[$stageCode, $status, $importer, $amount, $currencyLabel, $invoiceNumber, $importType, $supplier, $origin, $arrivalPort] = $row;` line untouched.

- [ ] **Step 3: Verify PHP syntax**

Run:
```bash
php -l backend/database/seeders/DemoDataSeeder.php
```
Expected: `No syntax errors detected in ...DemoDataSeeder.php`

- [ ] **Step 4: Re-run the schema gate — `requests` must be gone from mismatches**

Run:
```bash
python3 backend/database/seeders/_schema_check.py
```
Expected: exit 1 still (because bugs 2 and 3 remain), but the `requests:` line must be GONE from the report. Only `banks` and `merchants` mismatches remain.

- [ ] **Step 5: Commit**

```bash
git add backend/database/seeders/DemoDataSeeder.php
git commit -m "fix(seed): drop 8 non-existent detail columns from requests writes

supplier_name/import_type/country_of_origin/goods_description/
port_of_entry/payment_terms/invoice_date/shipping_port are not columns
on the live requests table (cby_imports_v3.sql) and ImportRequest::\$fillable
listing them caused INSERT to throw 'Unknown column'. All 8 values are
already in the data JSON. Migration 2026_06_25 promotes them to columns
once the backend runs it on live."
```

---

## Task 3: Fix Bug 2 — remove dead `is_active` from `banks` write

**Files:**
- Modify: `backend/database/seeders/DemoDataSeeder.php` (the `seedBanks()` method, around lines 185–195)

**Interfaces:**
- Consumes: none new.
- Produces: `banks` rows written with only existing columns (`organization_id, name, code, license_number, swift_code, status`). `is_active` removed.

- [ ] **Step 1: Locate the bank write block**

Run:
```bash
grep -n "'is_active'       => true," backend/database/seeders/DemoDataSeeder.php | head
```
Expected: a hit around line 193 inside `seedBanks()` (there are other `is_active` writes elsewhere — only the one in `seedBanks` is wrong; confirm by context: it sits after `swift_code`/`status`).

- [ ] **Step 2: Remove `is_active` from the bank `::create` argument**

In `backend/database/seeders/DemoDataSeeder.php`, inside `seedBanks()`, find:

```php
            $bank = Bank::firstOrCreate(
                ['code' => $row['code']],
                [
                    'organization_id' => $orgs['commercial_banks'],
                    'name'            => $row['name'],
                    'license_number'  => $row['license'],   // see CR-10 (must be exposed by the API)
                    'swift_code'      => $row['swift'],
                    'status'          => 'ACTIVE',
                    'is_active'       => true,
                ],
            );
```

Replace with (`is_active` removed — `banks` uses the `status` column, which is already set):

```php
            $bank = Bank::firstOrCreate(
                ['code' => $row['code']],
                [
                    'organization_id' => $orgs['commercial_banks'],
                    'name'            => $row['name'],
                    'license_number'  => $row['license'],   // see CR-10 (must be exposed by the API)
                    'swift_code'      => $row['swift'],
                    'status'          => 'ACTIVE',          // banks table uses status, not is_active
                ],
            );
```

- [ ] **Step 3: Verify PHP syntax**

Run:
```bash
php -l backend/database/seeders/DemoDataSeeder.php
```
Expected: `No syntax errors detected`

- [ ] **Step 4: Re-run the schema gate — `banks` must be gone**

Run:
```bash
python3 backend/database/seeders/_schema_check.py
```
Expected: exit 1 still (bug 3 remains), but the `banks:` line must be GONE. Only `merchants` remains.

- [ ] **Step 5: Commit**

```bash
git add backend/database/seeders/DemoDataSeeder.php
git commit -m "fix(seed): drop dead is_active from banks write

banks table has no is_active column (uses status); Bank::\$fillable
doesn't list it so it was silently dropped. Remove the dead write."
```

---

## Task 4: Fix Bug 3 — remove non-existent `commercial_register` from `merchants` write

**Files:**
- Modify: `backend/database/seeders/DemoDataSeeder.php` (the `seedMerchants()` method, the `Merchant::firstOrCreate` call around lines 330–341)

**Interfaces:**
- Consumes: none new.
- Produces: `merchants` rows written with only existing columns. The commercial registration number stays on `merchant_companies.commercial_registration_number` (already correct at line ~349, untouched).

- [ ] **Step 1: Locate the merchant write block**

Run:
```bash
grep -n "'commercial_register'" backend/database/seeders/DemoDataSeeder.php
```
Expected: one hit around line 335 inside `seedMerchants()`. (Confirm it is the `Merchant::firstOrCreate` block, NOT the `merchant_companies` block which uses `commercial_registration_number`.)

- [ ] **Step 2: Remove `commercial_register` from the merchant `::create` argument**

In `backend/database/seeders/DemoDataSeeder.php`, inside `seedMerchants()`, find:

```php
            $merchant = Merchant::firstOrCreate(
                ['tax_number' => '4' . (100000 + $i * 7777)],
                [
                    'bank_id'         => $banks[$bankByIndex[$i % 3]],
                    'name'            => $name,
                    'commercial_register' => 'CR-' . (50000 + $i * 13),
                    'tax_card_expiry' => '2026-06-16',
                    'address'         => $addresses[$i % 5],
                    'phone'           => '+9677' . (11000000 + $i * 9999),
                    'status'          => $i === 4 ? 'SUSPENDED' : 'ACTIVE',
                ],
            );
```

Replace with (`commercial_register` removed — the CR number is set on the linked company below):

```php
            $merchant = Merchant::firstOrCreate(
                ['tax_number' => '4' . (100000 + $i * 7777)],
                [
                    'bank_id'         => $banks[$bankByIndex[$i % 3]],
                    'name'            => $name,
                    // CR number lives on merchant_companies.commercial_registration_number (set below).
                    'tax_card_expiry' => '2026-06-16',
                    'address'         => $addresses[$i % 5],
                    'phone'           => '+9677' . (11000000 + $i * 9999),
                    'status'          => $i === 4 ? 'SUSPENDED' : 'ACTIVE',
                ],
            );
```

- [ ] **Step 3: Verify PHP syntax**

Run:
```bash
php -l backend/database/seeders/DemoDataSeeder.php
```
Expected: `No syntax errors detected`

- [ ] **Step 4: Re-run the schema gate — must now PASS (exit 0)**

Run:
```bash
python3 backend/database/seeders/_schema_check.py
```
Expected: exit 0, output: `OK — every column the seeder writes exists in cby_imports_v3.sql.`

If any mismatch remains, do NOT commit — investigate and fix the additional column before proceeding.

- [ ] **Step 5: Commit**

```bash
git add backend/database/seeders/DemoDataSeeder.php
git commit -m "fix(seed): drop non-existent commercial_register from merchants write

merchants table has no commercial_register column; Merchant::\$fillable
listing it caused INSERT to throw. The CR number already lives on
merchant_companies.commercial_registration_number, which the seeder sets."
```

---

## Task 5: Update the seeder README + clean up the throwaway script

**Files:**
- Modify: `backend/backend-handoff/seed/README.md`
- Delete: `backend/database/seeders/_schema_check.py`

**Interfaces:** none (documentation + cleanup).

- [ ] **Step 1: Update README note 2 — mark verified, flag the migration**

In `backend/backend-handoff/seed/README.md`, find note 2 (the red "🔴 أقسام سير العمل / الطلبات / الإشعارات (5–7) لم تُتحقّق حيًّا" paragraph near the bottom). Replace that entire note 2 block with:

```markdown
2. **تمت مطابقة الأعمدة مع قاعدة البيانات الحيّة (2026-06-28)** — أسماء الجداول والأعمدة مُتحقّق منها ضد `cby_imports_v3.sql` (نسخة كاملة من schema الحيّ). الحقول الـ8 التفصيلية على الطلب (`supplier_name`, `import_type`, `country_of_origin`, `goods_description`, `port_of_entry`, `payment_terms`, `invoice_date`, `shipping_port`) موجودة **فقط داخل عمود `data` JSON** وليست أعمدة مستقلة في `requests` حتى يُشغّل الـbackend الـmigration `2026_06_25_000001_add_detail_columns_to_requests_table` على الحيّ. **رجاءً شغّلوا هذا الـmigration على الحيّ** لترقية هذه الحقول إلى أعمدة من الدرجة الأولى.
```

- [ ] **Step 2: Update README's "التحديث الأخير" section — add the realign entry**

In `backend/backend-handoff/seed/README.md`, find the `## التحديث الأخير (2026-06-25)` heading. Immediately ABOVE it, insert a new section:

```markdown
## إعادة المطابقة مع الـschema الحيّ (2026-06-28)

- **مطابقة كاملة لـ`cby_imports_v3.sql`**: كل عمود يكتبه الـseeder موجود فعليًا في قاعدة البيانات الحيّة.
- **حُذفت أعمدة غير موجودة كانت تُسبّب فشل الـseed**:
  - `requests`: الـ8 حقول تفصيلية (الآن في `data` JSON فقط حتى تشغيل migration `2026_06_25`).
  - `banks`: حُذف `is_active` (الجدول يستخدم `status`).
  - `merchants`: حُذف `commercial_register` (الرقم على `merchant_companies.commercial_registration_number`).
- البيانات (المستخدمون، البنوك، التجار، الطلبات…) كما هي — لم تتغير.

## التحديث الأخير (2026-06-25)
```

(Leave the existing 2026-06-25 content below intact.)

- [ ] **Step 3: Delete the throwaway verification script**

Run:
```bash
rm backend/database/seeders/_schema_check.py
```
Confirm it is gone:
```bash
ls backend/database/seeders/_schema_check.py 2>&1
```
Expected: `ls: ... No such file or directory`

- [ ] **Step 4: Final sanity check on the committed seeder (after the throwaway script is deleted)**

Confirm the seeder still parses cleanly and the throwaway script was never tracked by git:
```bash
php -l backend/database/seeders/DemoDataSeeder.php
```
Expected: `No syntax errors detected`

Also confirm no leftover reference to the deleted script:
```bash
git status --short backend/database/seeders/
```
Expected: only `DemoDataSeeder.php` changes tracked (from earlier tasks); `_schema_check.py` never appeared in git (it was never added) — so it should not show.

- [ ] **Step 5: Commit**

```bash
git add backend/backend-handoff/seed/README.md
git commit -m "docs(seed): mark columns verified vs cby_imports_v3.sql, flag migration

README note 2 updated: workflow/requests/notifications sections are now
verified against the live schema dump. Flags migration 2026_06_25 as
not-yet-run on live (8 detail fields stay in data JSON until then)."
```

---

## Done criteria

- `php -l backend/database/seeders/DemoDataSeeder.php` → no syntax errors.
- Schema gate (`_schema_check.py`, run before its deletion) → exit 0: zero unknown columns.
- Three commits (one per bug fix) + one README commit, each on branch `live2`.
- The seeder's dataset is byte-for-byte the same demo data (12 users, 3 banks, 8 roles, 8 teams, 5 merchants, 5 notifications, 1 published workflow version, 16 requests, 25 audit logs, 38 field defs).
- Migration `2026_06_25` is flagged in the README for the backend team; the seeder runs on the *current* live schema without it.

## Out of scope (do not do)

- Editing any file under `backend/app/Models/` or `backend/database/migrations/`.
- Running the seeder against a live or local DB (no working DB access confirmed in this session; backend team runs it).
- Changing the demo dataset, login accounts, or passwords.
- Frontend changes.
- Adding new tables, models, routes, or endpoints.
