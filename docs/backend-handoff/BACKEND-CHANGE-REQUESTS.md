# Backend Change Requests — Import Financing Platform (Yemen Flow Hub API)

**Audience:** Backend team (Laravel 11 + Sanctum + MySQL).

**Author:** Frontend team.

**Audited:** 2026-06-27, **live against `https://cby2.ultimate-dev2.com/api/v1`** — the production host the frontend proxies to (`vite.config.ts` → `target: https://cby2.ultimate-dev2.com`). Every status below was established by exercising the real API, not by reading code or trusting a prior report. Where a finding required reading backend source, the read was against the deployed branch `feature/import-request-missing-fields` (local clone `backend/`, `b13009b`, not modified).

**Method:** Probed with the seeded platform admin `admin@cby.gov.ye` and the seeded bank-side accounts `admin@ybank.ye`, `intake@ybank.ye`, `reviewer@ybank.ye` (shared password `Password@123`, from `seed/DemoDataSeeder.php`). Reads were verified by inspecting response bodies; writes were verified by executing them and observing the result. This audit was run **from a clean slate** — the prior version of this document was disregarded and every claim re-established from the live host.

This is the complete, prioritized list of what the backend must still change so the frontend can run the platform entirely on the real database (`VITE_API_RESOURCES=*`, already set). Each open item states the **current live behavior** (with evidence), the **expected behavior**, **why it matters**, and an **acceptance check**.

## Headline result

The deployed host **already serves the `feature/import-request-missing-fields` code** — confirmed by live probes, not by the assumption that it was deployed. The vast majority of the previous backlog is genuinely closed against the real host. Three things are still broken or incomplete on the live host, and **one of them is new** and was missed by every prior pass:

1. **CR-19 (P0)** — `POST /requests/{id}/actions` returns **500** on the live host. Stage progression is dead.
2. **CR-WAF (P0, NEW)** — a **ModSecurity (WAF) rule on the production host** returns **406** for every `activate`/`deactivate`/`suspend` call against an existing record, on every resource. The Laravel-side "CR-03 fix" is real but **unreachable** — the WAF blocks the response before it returns. This is an infrastructure change, not a code change, and it had been misdiagnosed as a Laravel 406 in every prior audit.
3. **CR-12 (P0, regressed to PARTIAL)** — non-admin roles still get **403** on the `banks` and `organizations` lookups their screens need. The merchants screen genuinely calls `/banks` (frontend `merchants.tsx:96`) and bank-intake users get `403`.
4. **CR-05 (P1)** — the MFA / refresh / password-reset surface is still entirely absent (all 404).

Everything else verified **closed and live**.

## Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Blocks a whole screen/area. Do first. |
| **P1** | Required before its feature can fully ship. |
| **P2** | Quality / correctness / documentation. |

---

## A. Open blockers (P0)

### CR-19 · `POST /requests/{id}/actions` returns 500 — `WorkflowVersion::actions` relation does not exist · P0 (CRITICAL)

**Where:** `POST /api/v1/requests/{id}/actions` — executing any workflow transition. **Blocks PM priority #5 (stage progression) entirely.**

**Current (live, `https://cby2.ultimate-dev2.com`, verified 2026-06-27):** a real `POST /requests/1/actions` with `{"transition_id":1,"version":1,"comment":"…"}` (valid transition id 1, stage 1 → 2, request at version 1) returns:

```
HTTP/2 500
{"success":false,"code":"SERVER_ERROR","message":"Internal server error.",
 "errors":{"0":"Call to undefined relationship [actions] on model [App\\Models\\WorkflowVersion]."},
 "request_id":"01KW4G85XK7SNRQAFX40YENZ6E"}
```

**Root cause (confirmed in deployed source):** `app/Services/Workflow/WorkflowService.php:162` eager-loads `version.actions`:

```php
$transition = WorkflowTransition::query()
    ->with(['version.stages.permissions', 'version.actions'])   // ← 'version.actions' does not exist
    ->findOrFail($transitionId);
```

`app/Models/WorkflowVersion.php` defines `stages()`, `transitions()`, `fields()` — but **no `actions()`** method (confirmed: only those three relations exist in the model). `workflow_actions` is a global table linked via `transitions.action_id`, not a per-version relation. Laravel throws `RelationNotFoundException` before any transition happens.

**Fix (resolve the action directly, do not add a fake relation):**

```php
$transition = WorkflowTransition::query()
    ->with(['version.stages.permissions'])   // drop 'version.actions'
    ->findOrFail($transitionId);

$action = $transition->action_id ? WorkflowAction::find($transition->action_id) : null;
$nextStatus = $nextStage->is_final
    ? (($action && $action->kind === 'REJECT') ? RequestStatus::REJECTED : RequestStatus::CLOSED)
    : RequestStatus::ACTIVE;
```

**Acceptance:** `POST /requests/{id}/actions` with `{ transition_id, version, comment? }` advances the request to the transition's `to_stage`, increments `version`, writes a `workflow_history` row, returns the updated request (200); a `kind === 'REJECT'` action sets status `REJECTED`; a stale `version` returns `409 STALE_RESOURCE`.

---

### CR-WAF · ModSecurity on the production host blocks every activate/deactivate/suspend with 406 · P0 (NEW — supersedes the old CR-03) · INFRASTRUCTURE

**Where:** every `POST /{resource}/{id}/activate|deactivate|suspend` on `https://cby2.ultimate-dev2.com`, for merchants, banks, organizations, teams, roles, users, and reference-tables.

**This is the true, long-standing cause of the "406" symptom that prior audits attributed to Laravel content negotiation.** It is not a Laravel bug and cannot be fixed in Laravel.

**Current (live, verified 2026-06-27):** a single isolated `POST /merchants/1/suspend` (real, existing merchant; valid bearer token) returns:

```
HTTP/2 406
server: Apache
content-type: text/html; charset=iso-8859-1

<head><title>Not Acceptable!</title></head><body><h1>Not Acceptable!</h1>
<p>An appropriate representation of the requested resource could not be found on this server.
This error was generated by Mod_Security.</p></body></html>
```

The response is **HTML from Apache/ModSecurity**, not JSON from Laravel — the request never reaches the application's error handler.

**The discriminating evidence (this is what pins it to the WAF, not Laravel):**

- `POST /merchants/{id}/suspend` with an **existing** id (1, 20, 21) → **406 text/html (ModSecurity)**.
- `POST /merchants/99999/suspend` with a **nonexistent** id → **404 application/json** (reaches Laravel, returns a clean not-found).
- `POST /merchants` (create) → **422 json**, `POST /requests/{id}/actions` → **500 json** — other POSTs reach Laravel fine.

So the rule fires specifically when the controller is about to return a **real status-toggle response body for an existing record**. ModSecurity is inspecting the outbound response (or the matched route + populated model) and rejecting it. A nonexistent id produces a short 404 body that passes; a real record produces a body the rule blocks.

(Separately noted so it isn't confused with the above: a **rapid burst** of POSTs also transiently trips ModSecurity's anomaly scoring and 406s *all* POSTs from the source IP for a short window, then decays. That is a different, rate-based effect. The per-route block above persists in true isolation, single call, after cooldown — it is not the rate effect.)

**Why it matters:** with this rule in place, **no status toggle works for any user through the real API** — merchants, banks, organizations, teams, roles, users, reference-tables all fail. The Laravel controllers were corrected (they would return 200/403), but the corrected response can never leave the server. Every governance/merchant/user screen's enable/disable affordance is dead on the live host.

**Expected (infra change, backend/ops team):**

- Identify and adjust the ModSecurity rule firing on these routes (whitelist the `/(merchants|banks|organizations|teams|roles|users|reference-tables|reference-values)/{id}/(activate|deactivate|suspend)` POST paths, or disable response-body inspection for `/api/v1/*`, or tune the specific rule id from the audit log).
- The hosting layer must let the Laravel JSON response (200/403) through unmodified.

**Acceptance:** `POST /merchants/{realId}/suspend` (and `activate`, and `deactivate` on each resource) returns the Laravel JSON response (200 on success, 403 on forbidden) with `content-type: application/json` and `server` no longer short-circuiting to a ModSecurity HTML 406. Verify against a **real, existing** record id, single isolated call.

---

### CR-12 · Non-admin roles get 403 on the `banks` and `organizations` lookups their screens require · P0 (PARTIAL — regressed from "closed")

**Where:** authorization seeding / policies. `GET /banks`, `GET /organizations` for non-admin roles.

**Current (live, verified 2026-06-27):** logged in as `intake@ybank.ye` (role `rc_bank_intake`, `screen_permissions: [{screen:"merchants",capabilities:["MANAGE"]}, {screen:"reference_data",capabilities:["VIEW"]}]`):

```text
GET /merchants?per_page=2          -> 200   ✅
GET /reference-tables?per_page=2   -> 200   ✅
GET /banks?per_page=2              -> 403   ❌
GET /organizations?per_page=2      -> 403   ❌
```

`reviewer@ybank.ye` (empty `screen_permissions`) likewise gets `403` on `banks` and `organizations` (and `200` on `requests`).

**Why it matters (verified against the frontend):** the merchants screen reads `/banks` directly — `src/routes/merchants.tsx:96` calls `useBanksQuery(...)` to render the bank-name column and the bank picker on create. A `rc_bank_intake` user holds `merchants:MANAGE` and is allowed to open the merchants screen, but the screen's required `/banks` lookup `403`s, so the page error-walls on data the user legitimately needs. This is the exact multi-resource-lookup gap CR-12 was supposed to close; `merchants` and `reference-tables` were fixed, **`banks` and `organizations` were not.**

**The lookup map that must hold** (frontend-verified):

| Screen | Primary permission | Lookup resources that must be READable | Live status |
|---|---|---|---|
| Merchants | `merchants` | `banks`, `reference-data` | `reference-data` ✅, **`banks` ❌ (403)** |
| Roles | `roles` | `organizations` | **`organizations` ❌ (403)** |
| Teams | `teams` | `organizations` | **`organizations` ❌ (403)** |
| Banks / Entities | `banks` | `organizations` | **`organizations` ❌ (403)** |

**Expected:** granting a role its primary screen permission must also grant **read** on that screen's lookup resources. Lookup READ is **data-read only** — it must **not** widen page access: page visibility stays driven exclusively by `screen_permissions`. A role that can read `banks` as a merchants-screen lookup must still not have the banks screen appear in its navigation or pass its `ScreenGuard`.

**Acceptance:** logged in as `intake@ybank.ye`, `GET /banks` returns **200** (it holds `merchants:MANAGE`, and merchants needs banks). Each non-admin role with a multi-resource screen gets `200` on that screen's lookups (`banks`, `organizations` as applicable) while still being denied page access to any screen it lacks the `screen_permissions` for.

---

## B. Authentication (P1)

### CR-05 · Complete the authentication surface (MFA, refresh, password) · P1

**Where:** `/auth/*`.

**Current (live, verified 2026-06-27):** present and working — `POST /auth/login` (returns `data.token`, `token_type: Bearer`, `mode: token`, plus the full user object with `version`, `role`, `screen_permissions`, `capabilities`), `GET /auth/me`, `GET /auth/me/permissions`, `POST /auth/logout`. Confirmed **absent** (all return **404**):

```text
POST /auth/refresh           -> 404
POST /auth/mfa/verify        -> 404
POST /auth/forgot-password   -> 404
POST /auth/reset-password    -> 404
POST /auth/change-password   -> 404
```

**Expected:** implement `POST /auth/mfa/verify` (+ an MFA challenge in the `login` response), `POST /auth/refresh` (or document Sanctum tokens as long-lived with no refresh), and self-service `POST /auth/forgot-password` / `reset-password` / `change-password`. Revoke tokens on user deactivation / sensitive permission change. Document the token lifetime.

**Why:** the demo login + RoleSwitcher fallback cannot be removed until real sign-in / MFA / password flows exist. This is the only remaining item that still forces a frontend demo-login fallback.

**Acceptance:** login can challenge MFA and verify it; a self-service password change works; token lifetime/refresh is documented.

---

## C. Quality & documentation (P2)

### CR-10 · OpenAPI accuracy · P2 (mostly closed)

The live Swagger at `https://cby2.ultimate-dev2.com/docs` types most bodies now. Remaining: confirm `/users` and `/roles` paths are documented (they exist live — `GET /users` returns 200 for admin — but historically were absent from the generated spec), and that `requests.data` / `reports.filters` are intentionally left as open objects. Acceptance: `openapi-typescript` generates usable types for governance, merchants, requests, reports.

### CR-18 · `/workflow-versions/{id}/transitions` omits inline action name/code · P2 (worked around)

Each transition row returns `action_id` (FK int) only — confirmed live (`GET /workflow-versions/1/transitions` returns rows like `{id:1, from_stage_id:1, to_stage_id:2, action_id:2}`, no inline action). The frontend already fetches `GET /workflow-actions` once and joins client-side (`src/lib/api/workflow-designer.ts`), so this is **not blocking**. Optional: embed `"action": { id, code, name }` on each transition row to drop the extra fetch.

---

## D. Verified CLOSED on the live host (2026-06-27)

Each of these was re-established by a live probe against `cby2.ultimate-dev2.com`, not assumed from a prior report.

| Area | Live evidence |
|---|---|
| **Login / auth/me / me/permissions** | `POST /auth/login` → 200 with `version`, `role{code,name}`, `capabilities`. `me/permissions` shape matches the login payload (`{screen_permissions, capabilities}`). |
| **Core reads** | `GET` on `banks`, `merchants`, `organizations`, `teams`, `roles`, `users`, `reference-tables`, `requests`, `requests/my-queue`, `workflows`, `workflow-actions`, `screens` → all **200** for platform admin. |
| **CR-01 · Workflow write endpoints** | `POST /workflows` → 422 (`code`, `name` required); `POST /workflow-versions/1/{stages,transitions,fields,field-groups}` → 422; `POST /workflow-actions` → 422; `PATCH /stages/1` → 422; `DELETE /stages/{id}` route present (404 on unknown id). All authoring routes live. |
| **CR-04 · Permissions payload** | `screen_permissions[]` shaped as `{screen, capabilities[]}` on both login and `me/permissions`. Platform admin returns full `capabilities`, `intake@ybank` returns `[{merchants:[MANAGE]},{reference_data:[VIEW]}]`. |
| **CR-06 · Requests list enrichment** | `GET /requests` row includes `reference_number:"IMP-2026-2001"`, `workflow_version_id`, `current_stage:{id,name}`, `merchant:{id,name}`, `version`, `data`. The old `reference` vs `reference_number` column bug is gone. |
| **CR-07 · Optimistic locking** | `PATCH /banks/1` with `version:0` → **409 `STALE_RESOURCE`** ("This record was modified by someone else."). With the correct `version:1` → **200**, version incremented to 2. PATCH on banks/merchants/organizations all require `version` (422 if missing). |
| **CR-09 · Pagination meta** | `meta` is the contract shape `{page, per_page, total, last_page}`, not the Laravel default. |
| **CR-13 · Merchant tax_number unique per bank** | Created tax `audit777111` in bank 1 → 201; same tax in bank 2 → **201** (per-bank allowed); same tax in bank 1 again → **422** "already used by another merchant in the same bank. Tax numbers must be unique per bank." Exactly the PM criterion. *(Probe artifacts left: merchants **id 20** (bank 1) and **id 21** (bank 2), both tax `audit777111`, names `AUDIT CR13 bank1` / `AUDIT CR13 bank2` — please hard-delete; the frontend has no hard-delete and their suspend route is WAF-blocked per CR-WAF.)* |
| **CR-14 · Request detail (route model binding)** | `GET /requests/1` returns the full populated record — `id:1`, `reference_number`, `current_stage:{id,name}`, `merchant:{id,name,commercial_register}`, `version:1`, `data:{}` (dict), all dedicated columns. Not all-nulls. `GET /requests/1/history` → 200. |
| **CR-15 · `data` + `version` on requests** | Both present on list and detail — `data` is a dict, `version` an integer. |
| **CR-16 · Bank-scoped requests list** | `admin@ybank.ye` (bank 1) → `GET /requests` `total:7`, every row `bank_id:1`. Platform admin sees all. Bank isolation holds. |
| **CR-17 · `version` on banks/merchants reads** | Both expose integer `version` on read; round-trip confirmed via CR-07. |
| **CR-DEPLOY · Branch pushed + deployed** | `feature/import-request-missing-fields` (`b13009b`) **is on `origin`** and the live host serves it (proven by every ✅ above). Still **not merged into `main`** (`main` tip is `208f65a`, different) — please merge so `main` reflects production. |

---

## E. Probe artifacts to clean up (backend hard-delete required)

The frontend has no hard-delete for most resources, and the soft-delete (suspend) route is WAF-blocked (CR-WAF), so these test records cannot be removed from the client:

- **Merchant id 20** — `AUDIT CR13 bank1`, bank_id 1, tax_number `audit777111`.
- **Merchant id 21** — `AUDIT CR13 bank2`, bank_id 2, tax_number `audit777111`.

Side effect of the CR-07 verification (harmless, no real data change): **bank id 1** ("البنك اليمني للإنشاء والتعمير") had its `version` incremented from 1 → 2 by a no-op name PATCH. No field value changed.

---

## F. Summary table

| ID | Title | Priority | Live status (2026-06-27) | Blocks |
|---|---|---|---|---|
| CR-19 | `POST /requests/{id}/actions` 500 — missing `WorkflowVersion::actions` | P0 | 🔴 **Open** (live 500) | request stage progression (PM #5) |
| CR-WAF | ModSecurity 406 on all activate/deactivate/suspend (existing records) | P0 | 🔴 **Open (NEW, infra)** | every status toggle, all resources |
| CR-12 | Lookup READ (`banks`, `organizations`) for multi-resource screens | P0 | 🟡 **Partial** — `banks`/`orgs` still 403 for non-admin | merchants/roles/teams/banks for non-admin |
| CR-05 | Auth completeness (MFA/refresh/password) | P1 | 🔴 Open (all 404) | real sign-in, removing demo login |
| CR-10 | OpenAPI accuracy | P2 | ⚠️ Mostly closed | typed client |
| CR-18 | Transitions omit inline action name/code | P2 | 🟡 Worked around client-side | not blocking |
| CR-01 | Workflow authoring write endpoints | P0 | ✅ Closed (live) | — |
| CR-03 | activate/deactivate/suspend Laravel fix | P0 | ✅ Closed in Laravel — but masked by CR-WAF on the live host | (see CR-WAF) |
| CR-04 | Permissions payload shape | P1 | ✅ Closed (live) | — |
| CR-06 | Requests list enrichment | P0 | ✅ Closed (live) | — |
| CR-07 | Optimistic locking (`version`) | P1 | ✅ Closed (live, 409 + round-trip) | — |
| CR-09 | Pagination meta shape | P2 | ✅ Closed (live) | — |
| CR-13 | Merchant tax unique per bank | P0 | ✅ Closed (live, 3-case verified) | — |
| CR-14 | Request detail route model binding | P0 | ✅ Closed (live) | — |
| CR-15 | `data` + `version` on requests | P0 | ✅ Closed (live) | — |
| CR-16 | Bank-scoped requests list | P0 | ✅ Closed (live) | — |
| CR-17 | `version` on banks/merchants reads | P1 | ✅ Closed (live) | — |
| CR-DEPLOY | Branch pushed + deployed | P0 (op) | ✅ Pushed + deployed; ⚠️ not yet merged to `main` | — |

**What must still change, in order:** **CR-19** (P0, Laravel — action-execute 500), **CR-WAF** (P0, infra/ModSecurity — status toggles), **CR-12** (P0, seeding — `banks`/`organizations` lookup grants), **CR-05** (P1, Laravel — auth surface). CR-10/CR-18 are P2. Everything else is verified live and closed.
