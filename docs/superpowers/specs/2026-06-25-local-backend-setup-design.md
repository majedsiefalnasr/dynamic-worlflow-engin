# Design — Local Backend Setup + Baseline Verification (Sub-project 1 of 6)

**Date:** 2026-06-25
**Author:** Frontend team
**Status:** Approved

## Goal

Get the Laravel backend running locally from `fix/p0-cr-backend-fixes` (inside the gitignored
`backend/` checkout), point the frontend (on `fix/p0-source-comparison-docs`) at it instead of
the remote `cby2.ultimate-dev2.com` API, and verify all 11 already-enabled resources work
correctly against the local database with seeded demo data.

This is the foundation for sub-projects #2–6, which will progressively wire the remaining
mock-only screens (users, workflow authoring, request runtime, screen permissions) and
ultimately remove all mock fallback.

## Sub-project roadmap (this spec covers #1 only)

**Reordered 2026-06-25 to match the project manager's minimum-viable priority**
(login → bank management → users → merchants → request creation/stages).
Workflow-designer authoring (old #3) and the screen-permissions gate (old #5)
are demoted, not cancelled — the PM has not asked for them yet.

| # | Sub-project | Depends on | Delivers | PM priority |
|---|---|---|---|---|
| **1** | **Local backend setup + baseline verification** | — | Laravel running locally, 11 resources verified | #1 login, #2 banks (already pass) |
| **2** | **Users system** | #1 | `users.ts` client, `bank.users` + `admin.cby-staff` live | #3 users |
| **3** | **Merchants verification + CR-13 close-out** | #1 | Bank-scoping confirmed (already correct); tax-number-per-bank regression test once backend ships the fix | #4 merchants |
| 4 | Request runtime | #1, #2 | Create/draft/actions/documents via live API | #5 requests + stages |
| 5 | Workflow designer writes | #1 | Authoring UI writes to backend CRUD | not currently prioritized |
| 6 | Screen permissions gate | #1, #2 | `admin.screen-permissions` wired to live model | not currently prioritized |
| 7 | Mock removal + `VITE_API_RESOURCES=*` | #1–#6 | Remove `mock.ts`, `db.ts`, mock cells, `wfStore` mock paths | final cleanup |

## Architecture

```
Frontend (fix/p0-source-comparison-docs)
  └─ Vite dev server (port 5173)
       └─ proxy /api → http://localhost:8000
            └─ Laravel (php artisan serve, port 8000)
                 └─ MySQL 8 (Docker container, port 3306)
                      └─ cby_imports DB (migrated + seeded)
```

No frontend code changes for the connection swap — only the Vite proxy target in
`vite.config.ts` changes from `https://cby2.ultimate-dev2.com` to `http://localhost:8000`.
The frontend already uses `/api/v1` as its base URL via `VITE_API_BASE_URL=/api/v1`,
and the Vite proxy forwards it to whichever backend the target points at.

## Components

### 1. Docker MySQL container

```bash
docker run -d --name cby-mysql \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=cby_imports \
  -p 3306:3306 \
  mysql:8
```

Mapped to `localhost:3306`. Database `cby_imports` created automatically by the
`MYSQL_DATABASE` env var. No persistent volume needed for now — demo data is seeded
fresh each time.

### 2. Backend `.env` configuration

In `backend/.env` (gitignored, not committed):

```
APP_NAME="CBY Imports Platform"
APP_ENV=local
APP_KEY=<generated>
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cby_imports
DB_USERNAME=root
DB_PASSWORD=secret

SANCTUM_STATEFUL_DOMAINS=localhost:5173
SESSION_DOMAIN=localhost
```

`SANCTUM_STATEFUL_DOMAINS` and `SESSION_DOMAIN` may need tuning depending on whether
the frontend uses cookie-based or Bearer-token auth. The current frontend uses Bearer
tokens (`data.token` stored in memory after login), so Sanctum stateful domains may
not be needed — but including them ensures cookie-based auth also works if tested
via browser directly.

### 3. Migration + seed

```bash
cd backend
php artisan migrate --seed
```

This runs all migrations and `DemoDataSeeder`, which creates: 3 organizations, 8 teams,
8 roles (+ screen permissions via `seedScreenPermissions()`), 3 banks, reference data,
demo users (including `admin@cby.gov.ye` with password `Password@123`), merchants,
notifications, a published workflow version with stages/transitions/fields, sample
requests, and audit logs.

### 4. Laravel serve

```bash
php artisan serve --port=8000
```

Runs on `http://localhost:8000`. The frontend's Vite proxy will forward `/api/*` here.

### 5. Frontend proxy swap

In `vite.config.ts`, change the proxy target:

```typescript
proxy: {
  "/api": {
    target: "http://localhost:8000",  // was: "https://cby2.ultimate-dev2.com"
    changeOrigin: true,
    secure: false,                    // was: true (no SSL for localhost)
  },
```

No other frontend changes. `VITE_API_BASE_URL=/api/v1` stays the same.
`VITE_API_RESOURCES` stays at the current 11-key list.

### 6. Branch setup

- Frontend: `git checkout fix/p0-source-comparison-docs`
- Backend: `cd backend && git checkout fix/p0-cr-backend-fixes`

### 7. Baseline verification

Login as `admin@cby.gov.ye` / `Password@123` in the browser at `http://localhost:5173`.
Walk through each enabled resource and confirm it works:

| Resource | Test action | Expected |
|---|---|---|
| Organizations | List, create, edit, activate/deactivate | CRUD works, toggle returns 200 |
| Teams | List, create, edit, activate/deactivate, **delete** | All work — delete is new (our CR-03 fix) |
| Roles | List, create, edit, toggle | Works |
| Banks | List, create, edit, delete, toggle | Works |
| Reference data | List, create, deactivate | Works |
| Merchants | List, create, edit, **suspend/activate** | Suspend/activate now works (was 406 remotely, fixed in source) |
| Audit | List, view detail, export | Read-only, works |
| Reports | Summary, by-bank, by-currency, etc. | Read-only, works |
| Notifications | List, unread count | Read-only (mark-read/archive actions may still 406 — out of scope for this sub-project) |
| Requests list | List, my-queue | Read-only, works |
| Workflow view | View published workflow, graph | Read-only sync to `wfStore`, works |

Any failures found during verification are documented and either fixed in this sub-project
(if they're config/setup issues) or tracked as blockers for sub-projects #2–6 (if they
require real feature work).

## What this does NOT cover

- Building `users.ts` client or wiring user-management screens (sub-project #2)
- Wiring workflow designer authoring to backend CRUD (sub-project #3)
- Wiring request create/draft/actions/documents (sub-project #4)
- Wiring screen-permissions gate to live model (sub-project #5)
- Removing mock fallback code (sub-project #6)
- CORS configuration for production deployment (out of scope — Vite proxy sidesteps it)
- SSL/HTTPS for local dev (not needed)

## Success criteria

1. `docker ps` shows the MySQL container running
2. `php artisan serve` starts without errors
3. Login at `http://localhost:5173` succeeds with `admin@cby.gov.ye`
4. All 11 enabled resources load data from the local database (not the remote API)
5. CRUD operations on governance resources (orgs/teams/roles/banks) work end-to-end
6. The new CR-03 fix (DELETE /teams, activate/deactivate across all resources) works
   against the local backend
7. The new CR-12 fix (non-admin role screen permissions) can be verified by logging in
   as a non-admin seeded user and confirming lookup resources don't 403
