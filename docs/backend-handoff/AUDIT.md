# Project Audit — Real Database & API Usage

**Date:** 2026-06-24
**Live source:** `https://cby2.ultimate-dev2.com/api/v1` — docs: `https://cby2.ultimate-dev2.com/api/documentation` — OpenAPI JSON: `https://cby2.ultimate-dev2.com/docs` (92 paths, 114 operations).
**Probe account:** `admin@cby.gov.ye` (role `rc_platform_admin`, shared password in `seed/DemoDataSeeder.php`).

> **Goal of this file:** classify every screen/resource by how much it uses the real APIs — **full**, **partial**, or **mock only** — verified against the live backend. The actions required from the backend team are in [BACKEND-CHANGE-REQUESTS.md](BACKEND-CHANGE-REQUESTS.md).
>
> **This file does not change the app's behavior.** It describes the current state only.

---

## 0. How the app works (behavioral reference)

The app's behavior was confirmed from its state at commit `5e91b6b` (before the live-API work), where everything runs on local mock data. The live integration adds an **opt-in layer** on top without changing the default behavior:

- **The switch:** each screen calls `isApiEnabled("<resource>")` in [src/lib/api/client.ts](../../src/lib/api/client.ts).
  - `VITE_API_BASE_URL` empty → everything is mock (identical to `5e91b6b`).
  - `VITE_API_BASE_URL` set + `VITE_API_RESOURCES` contains the resource key (or `*`) → that screen uses the live API.
  - Default in [.env.example](../../.env.example): `VITE_API_RESOURCES=` empty → **all screens mock, except login**, which goes live as soon as `BASE_URL` is set.
- **Consistent pattern:** every screen has a `useXController()` that branches internally between a live React Query path and a mock-cell path. All hooks run on every render, so hook order stays stable. Switching mock↔live **never breaks a screen** — it only swaps the data source.
- **One thin client** (`api.get/getList/post/patch/put/del`) unwraps both success envelopes and maps errors to a typed `ApiError` carrying `code`/`fields`/`requestId`.
- **Token is in memory only** (never localStorage). Live login stores `data.token` (Sanctum Bearer).

> **Key point:** wiring a resource to the live API never deletes the mock — it stays as a fallback behind the flag. Running the whole project on the real database = set `VITE_API_RESOURCES=*` once the blocking items below are closed.

> **Currently enabled (`.env`, 11 resources):** `reference-data, organizations, teams, roles, banks, merchants, reports, audit, notifications, requests, workflows`. The last three (notifications, requests, workflows) are read-ready: their controllers branch per-operation and fall back to mock for any blocked write, so enabling them is safe and changes no behavior beyond swapping the read source. See §9 for why `*` is **not** used.

---

## 1. Overall verdict

Live-API **read coverage is high and ready** for the **admin** account: 19 resources, 92 paths. Every admin read (governance, merchants, audit, reports, notifications, workflow view, requests view) returns `200`. **Non-admin roles are blocked on multi-resource screens** (see item 5).

**Full real-API use is still blocked** by five items (detail in §3):

1. 🟥 **Workflow Designer is read-only** — no write endpoints for any component (CR-01).
2. 🟥 **User creation is blocked** — `role` is a required string with an incomplete value set; no users client in the frontend (CR-02).
3. 🟥 **All status actions return 406** (`activate/deactivate/suspend`), team hard-delete returns 500 (CR-03). Merchants and users have no workaround.
4. 🟧 **Permission gate** — ⚠️ **partially resolved**: `screen_permissions` is now **populated** in the `login`/`me` payload (e.g. `[{ screen:"merchants", capabilities:["MANAGE"] }]`); remaining work is OpenAPI documentation + request-create derivation (CR-04).
5. 🟥 **Non-admin multi-resource screens 403** — a role with the right `screen_permissions` (e.g. bank-intake with `merchants:MANAGE`) still 403s on the screen's **lookup** resources (`/banks`, `/reference-tables`), because lookup READ is not granted. Blocks merchants/roles/teams/banks for non-admin roles (CR-12).

Severity key: 🟥 blocker · 🟧 needs agreement · 🟨 improvement/confirm · 🟩 matches & ready.

---

## 2. Main classification — every screen and its real-API usage

Status: 🟢 **uses the real API fully** · 🟡 **uses it partially** · 🔴 **does not use it (mock/demo only)**.

| Screen / resource | `isApiEnabled` key | API client | Reads | Writes / actions | Status | Reason |
|---|---|---|---|---|---|---|
| Reference data | `reference-data` | `reference-data.ts` | 🟢 200 | create ✅ · delete via deactivate (PATCH workaround) | 🟢 | Full. "Delete" = deactivate. |
| Organizations | `organizations` | `organizations.ts` | 🟢 200 | create/update/delete ✅ · toggle via `PATCH is_active` (406 workaround) | 🟢 | Full, via the 406 workaround. |
| Teams | `teams` | `teams.ts` | 🟢 200 | create/update ✅ · toggle via PATCH · **hard-delete returns 500** | 🟡 | Hard delete blocked (CR-03). |
| Roles | `roles` | `roles.ts` | 🟢 200 | create/update ✅ · toggle via PATCH | 🟢 | Full. |
| Banks | `banks` | `banks.ts` | 🟢 200 (swift/license/status ✅) | create/update/delete ✅ · toggle via PATCH | 🟢 | Full. |
| Merchants | `merchants` | `merchants.ts` | 🟢 200 | create/update ✅ · **suspend/activate return 406, no workaround** | 🟡 | Status toggle blocked (CR-03). Nested owners/companies need write-shape confirmation (CR-08). |
| Users | — (no client) | — | 🔴 | 🔴 | 🔴 | No `users.ts`. Creation blocked by `role` (CR-02) → screen stays fully mock. |
| Auth (login) | `hasApiBase()` | `auth.ts` | 🟢 login/me/logout | 🟡 | 🟡 | Login is live. **Missing: MFA verify, refresh, forgot/reset/change-password** (CR-05). |
| Audit | `audit` | `audit.ts` | 🟢 200 | read-only (server logs) | 🟢 | Full for reads. Client-side logging is off in API mode. |
| Reports | `reports` | `reports.ts` | 🟢 200 (summary + aggregates) | exports | 🟢 | Full. |
| Notifications | `notifications` | `notifications.ts` | 🟢 200 | **read-only** — mark-read/archive/read-all POST return 406 (CR-03) | 🟡 | Live reads; actions 406-blocked → buttons disabled in API mode. Client-side sending off. |
| Workflow — view | `workflows` | `workflow-designer.ts` | 🟢 syncs published → `wfStore` | 🔴 no writes | 🟡 | View is live; **authoring fully blocked** (CR-01) and stays mock. |
| Requests — list/queue | `requests` | `requests.ts` | 🟢 list + stages | 🔴 create/draft/actions/documents | 🟡 | List is live but **not enriched** (CR-06). Runtime (create/actions) stays mock. |
| Screen permissions (`admin.screen-permissions`) | — | — | 🟡 `screens` + `me/permissions` return 200 | — | 🔴 | `screen_permissions` returns `[]`, shape undocumented (CR-04) → gate stays on the manual model. |
| Bank users (`bank.users`) | — (no client) | — | 🔴 | 🔴 | 🔴 | Reads `roleCatalog`/`teams` mock cells. Creation blocked by `role` (CR-02). |
| CBY staff (`admin.cby-staff`) | — (no client) | — | 🔴 | 🔴 | 🔴 | Reads governance mock cells (banks/teams/orgs/roles). Same users blocker (CR-02). |
| Requests — runtime (`requests.new`, `customs`) | — | — | 🔴 | 🔴 create/draft/actions/documents | 🔴 | Runs on `wfStore`. No live create/actions wiring; list under-enriched (CR-06). |
| Workflow instance (`workflows.instances.$id`) | — | — | 🔴 | 🔴 | 🔴 | Pure `wfStore` runtime (fields/history/actions). Stays mock until CR-06. |
| Requests — index (`requests.index`) | — | — | n/a | n/a | ⚪ | Redirect-only route (`Navigate`). No data, no API. |

### Count summary

- 🟢 **Full real-API use (6):** reference data, organizations, roles, banks, audit, reports.
- 🟡 **Partial (6):** teams (no hard delete), merchants (no status toggle), auth (no MFA/refresh/password), workflow view (no authoring), requests (list only), notifications (read-only — actions 406).
- 🔴 **Mock only (6):** users / bank-users / CBY-staff (blocked by CR-02), screen-permission gate (CR-04), requests runtime + workflow instance (CR-06 / no runtime wiring).
- ⚪ **N/A (1):** `requests.index` redirect route.

---

## 3. The four blockers (live evidence, 2026-06-24)

### 3.1 🟥 Workflow Designer has no write endpoints (CR-01)

The live API exposes **reads + lifecycle only**: `workflows` (3 GET), `workflow-versions` (10: reads + `clone/validate/publish/archive`), `stages` (GET/PUT for permissions & field-rules only). There is **no** `POST/PATCH/DELETE` for any definition/version/stage/transition/field/field-group/action.
**Effect:** `workflow-designer.ts` reads the published workflow and loads it into `wfStore` on mount, but any edit stays local (mock/localStorage). The `/admin/workflows` screen authors on mock.

### 3.2 🟥 User creation (CR-02)

`POST /v1/users` makes the `role` string **required** (OpenAPI: `required: [name, email, password, role]`; `role_id` is nullable). The accepted `role` value set is incomplete and does not cover all org roles. There is no `users.ts` client in the frontend → the whole screen is mock.

### 3.3 🟥 Status actions return 406 (CR-03)

Verified live today:

```text
POST /organizations/4/deactivate -> 406
POST /organizations/4/activate   -> 406
POST /merchants/5/suspend        -> 406
POST /merchants/5/activate       -> 406
```
**Workaround shipped in the frontend:** resources whose `PATCH` accepts `is_active` (organizations, teams, roles, banks, reference-tables/values) toggle via `PATCH {is_active}` — works. **Merchants and users have no workaround** (their `PATCH` rejects `status`/`is_active`) → their status toggle is blocked. `DELETE /teams/{id}` returns 500.

### 3.4 🟧 Permission gate (CR-04) — ⚠️ partially resolved

`screen_permissions` is now **populated** in the `login`/`me` user payload. Verified live for `intake@ybank.ye` (role `rc_bank_intake`):

```json
"screen_permissions": [ { "screen": "merchants", "capabilities": ["MANAGE"] } ],
"capabilities": ["MANAGE"]
```

Shape confirmed: `{ screen, capabilities: ("VIEW"|"CREATE"|"UPDATE"|"DELETE"|"EXPORT"|"MANAGE")[] }`. The frontend can gate **page access** off this. Remaining (CR-04): document the shape in the OpenAPI, confirm `GET /auth/me/permissions` matches the login payload, and specify how request-create permission is derived. `GET /screens` returns `{id, code, name, is_active}`.

### 3.5 🟥 Non-admin multi-resource screens 403 on lookups (CR-12)

A role with the correct `screen_permissions` can open its screen, but the screen's **supporting lookups** 403 because lookup READ is not granted. Verified live — `intake@ybank.ye` (has `merchants:MANAGE`) opening the merchants screen:

```text
GET /banks?per_page=100             -> 403
GET /reference-tables?per_page=100  -> 403
GET /merchants?per_page=100         -> 403   # must be 200 — user HAS merchants:MANAGE
```

Affected screens (master + lookup): **merchants** (lookups: banks, reference-data), **roles** (organizations), **teams** (organizations), **banks/entities** (organizations). Fix is backend: grant lookup READ to whichever role holds the primary screen permission — **without** widening page access (page visibility stays driven by `screen_permissions` only). Full map + acceptance in [BACKEND-CHANGE-REQUESTS.md](BACKEND-CHANGE-REQUESTS.md) CR-12.

---

## 4. What works correctly 🟩

- **Base path** `/api/v1`, **snake_case**, `page`/`per_page` on lists.
- **CORS** reflects the requesting origin with credentials (`Access-Control-Allow-Origin: http://localhost:8080`).
- **Error envelope** `{ success:false, code, message, errors, request_id }` (stable, machine-readable `code`).
- **List envelope** `{ success, message, data, meta }`.
- **User role** returned as `role: {id, code, name}` + `role_label` in `login`/`me`.
- **Banks** return `swift_code`/`license_number`/`status`.
- **Organizations** carry `category` + `category_label` natively.
- **A published workflow version** is seeded: `IMPORT_FINANCING` v1 (`published_version` present).
- **16 requests** + audit logs + notifications seeded.
- **Reports and audit** coverage is complete.

---

## 5. Non-blocking deviations 🟨

1. **`meta` shape** is the Laravel paginator default `{ current_page, last_page, per_page, total, from, to, links[] }` instead of `{ page, per_page, total, last_page }`. **Not breaking:** no screen reads `meta` fields (lists use a large `per_page`). Worth standardizing (CR-09).
2. **Optimistic locking (`version`)** is enforced only on `POST /requests/{id}/actions`. Other `PATCH` calls (governance/merchants/reference) neither require nor check `version` despite returning it — no `STALE_RESOURCE` protection (CR-07).
3. **Requests row is under-enriched (CR-06):** the list added claim fields (`is_claimed`, `current_owner_role`…) but still lacks `workflow_version_id`, `current_stage`, `merchant/applicant`, and `reference_number` is `null`.
4. **Generic OpenAPI schemas** — many bodies are generic `object`, so a typed client can't be generated (CR-10). Types are hand-written.
5. **Client-side logic moves to the server in API mode:** `logAudit`/`notify` stop (server logs/notifies). Already applied in the screens.

---

## 6. Mock store inventory (current fallback source)

| Store | Location | Matching resource | Status |
|---|---|---|---|
| Admin cells (`cell()`) | [src/lib/db.ts](../../src/lib/db.ts) / [governance.ts](../../src/lib/governance.ts) | audit, notifications, merchants, orgs, teams, roleCatalog, rolePerms, screenPerms, referenceTables | 🟢 mostly wired live |
| Users | [src/lib/mock.ts](../../src/lib/mock.ts) `cby:users` | `/users` | 🔴 blocked (CR-02) |
| Workflow engine | [src/lib/workflow-engine/storage.ts](../../src/lib/workflow-engine/storage.ts) `wfe:*` | `/workflows` + `/requests` | 🟡 view wired, authoring + runtime on mock |

---

## 7. Readiness per area

| Area | Readiness | Note |
|---|---|---|
| Reference data | ✅ Ready | Full. |
| Organizations / banks / roles | ✅ Ready | Full (toggle via PATCH). |
| Teams | ⚠️ Partial | Hard delete returns 500 (CR-03). |
| Users & auth | ⛔ Blocked (CR-02) + ⚠️ Missing (CR-05) | No user creation; no MFA/refresh/password. |
| Merchants | ⚠️ Partial | Status toggle 406 (CR-03); nested writes (CR-08). |
| Workflow Designer (authoring) | ⛔ Blocked (CR-01) | No write endpoints. |
| Workflow Designer (view) | ✅ Ready | Read + graph + lifecycle. |
| Requests (list/view) | ⚠️ Partial (CR-06) | Missing enrichment. |
| Requests (runtime) | ⛔ On mock | Create/actions not wired yet. |
| Audit / reports | ✅ Ready | Full. |
| Notifications | ⚠️ Partial | Reads live; mark-read/archive/read-all return 406 (CR-03) → read-only. |
| Screen-permission gate | ⚠️ Partial (CR-04) | `screen_permissions` now populated + shaped; needs OpenAPI doc + create-derivation. |
| Non-admin multi-resource screens | ⛔ Blocked (CR-12) | Role has page access but lookups (banks/orgs/reference) 403 → merchants/roles/teams/banks unusable for non-admin. |
| Users / bank-users / CBY-staff | ⛔ Blocked (CR-02) | No `users.ts` client; creation blocked by required `role`. |
| Requests runtime / workflow instance | ⛔ On mock | `wfStore`-driven; no live create/actions wiring (CR-06). |

---

## 8. Path recommendation (does not change behavior)

1. **Already on the real database** (in `.env`, 11 keys): reference data, organizations, teams, roles, banks, merchants, reports, audit, **notifications, requests, workflows**. Full for the 🟢 set; partial for the 🟡 set (the controller branch keeps the blocked operations on mock so app behavior is unchanged).
2. **Keep on mock** users / bank-users / CBY-staff, workflow authoring, the screen gate, and the request runtime until CR-01 / CR-02 / CR-04 / CR-06 are closed.
3. **Backend steps** to reach `VITE_API_RESOURCES=*` are in [BACKEND-CHANGE-REQUESTS.md](BACKEND-CHANGE-REQUESTS.md).

---

## 9. Why `VITE_API_RESOURCES=*` is intentionally not used

The enabled list is an **explicit 11-key allow-list**, not `*`. `*` would resolve **every** resource to the live API, including ones that have no live path:

| Excluded from live | Why `*` would break it | Blocking CR |
|---|---|---|
| **Users** (`bank.users`, `admin.cby-staff`) | No `users.ts` client exists; `POST /users` creation is blocked by the required `role` string. | CR-02 |
| **Screen-permission gate** (`admin.screen-permissions`) | `GET /auth/me/permissions` returns `screen_permissions: []` with an undocumented element shape — nothing to gate off. | CR-04 |
| **Workflow authoring** (`admin.workflows` writes) | No `POST/PATCH/DELETE` write endpoints for any workflow component. | CR-01 |
| **Request runtime** (`requests.new`, `customs`, `workflows.instances.$id`) | No live create/draft/actions/documents wiring; the list row is under-enriched. | CR-06 |

Each key in the enabled list has a real consumer with a verified mock fallback. `*` becomes the correct setting only once CR-01, CR-02, CR-04, and CR-06 are closed.
