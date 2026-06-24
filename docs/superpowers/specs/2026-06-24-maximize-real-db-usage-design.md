# Design — Maximize Real-DB Usage + Doc Sync

**Date:** 2026-06-24
**Author:** Frontend team
**Status:** Approved

## Goal

Push the app to use the real backend database as far as it safely can today, then bring the
backend-handoff docs back in sync with the actual code. No behavior change beyond enabling
already-wired, read-safe resources via configuration.

## Context

The live-API integration (commit `eed632b`) wired every screen behind two flags in
[src/lib/api/client.ts](../../../src/lib/api/client.ts):

- `VITE_API_BASE_URL` — when set, login goes live.
- `VITE_API_RESOURCES` — comma list of resource keys (or `*`) that resolve to the live API;
  everything else falls back to local mock.

Each migrated screen has a controller that branches per-operation between a live React Query
path and a mock-cell/`wfStore` path, with a fallback (`?? []`, `?? EMPTY_NOTIFS`). Flipping a
key never breaks a screen — it only swaps the data source for the operations that are wired.

Current `.env` enables 8 resources:
`reference-data, organizations, teams, roles, banks, merchants, reports, audit`.

The audit ([AUDIT.md](../../backend-handoff/AUDIT.md)) classifies `notifications`, `requests`,
and `workflows` as read-ready behind safe controller branches, but they are not yet in `.env`.
The docs also predate several routes (`admin.cby-staff`, `admin.screen-permissions`,
`bank.users`, `requests.*`, `customs`, `workflows.instances.$id`) and carry stale CR id
references.

## Part A — Maximize real-DB usage (config only, no code)

Add the three read-ready keys to `.env`:

```
# from (8 resources)
VITE_API_RESOURCES=reference-data,organizations,teams,roles,banks,merchants,reports,audit
# to (11 resources)
VITE_API_RESOURCES=reference-data,organizations,teams,roles,banks,merchants,reports,audit,notifications,requests,workflows
```

### Why each flip is safe (verified in code)

| Key | Sole consumer | Branch behavior | Result |
|---|---|---|---|
| `notifications` | `notifications.tsx` | `apiEnabled ? (apiQuery.data ?? EMPTY_NOTIFS) : cellItems`; `readOnly = apiEnabled` | Live reads; actions stay off (CR-03). |
| `requests` | `workflows.index.tsx` (list/queue view) | `requestsApi ? (apiInstances ?? []) : cellInstances` | Live list; runtime create/actions read `wfStore`, untouched. |
| `workflows` | `admin.workflows.tsx` | `wfApi` only gates the published-view read-sync into `wfStore`; authoring writes always go to `wfStore` | Live published view; authoring stays mock (CR-01). |

`requests.index.tsx` is a redirect (`Navigate`) only — no data, no risk.

### What stays mock (intentionally — blocked by open CRs)

- **Users** (`bank.users.tsx`, `admin.cby-staff.tsx`) — no `users.ts` client; creation blocked
  by required `role` string (CR-02).
- **Screen-permission gate** (`admin.screen-permissions.tsx`) — `screen_permissions` returns
  `[]`, shape undocumented (CR-04).
- **Workflow authoring** (`admin.workflows.tsx` writes) — no write endpoints (CR-01).
- **Request runtime** (`requests.new.tsx`, `customs.tsx`, `workflows.instances.$id.tsx`) —
  create/actions not wired; list under-enriched (CR-06).

### Why not `VITE_API_RESOURCES=*`

`*` would resolve **every** resource live, including `users` — which has **no client** and a
**blocked create path** (CR-02). It would also flip request runtime and the screen gate to
paths that have no live wiring. The explicit 11-key list is the maximum safe set: every key in
it has a real consumer with a verified fallback. `*` becomes correct only after CR-01, CR-02,
CR-04, and CR-06 close.

## Part B — Doc sync (full re-audit)

Update [AUDIT.md](../../backend-handoff/AUDIT.md),
[BACKEND-CHANGE-REQUESTS.md](../../backend-handoff/BACKEND-CHANGE-REQUESTS.md), and
[.env.example](../../../.env.example):

1. **Reconcile stale CR ids** — `.env.example:10` ("CR-06/CR-12") and `notifications.tsx:129`
   ("CR-12") reference ids that no longer match the canonical docs (users = CR-02, status
   actions = CR-03). Bring every reference to the current canonical id.
2. **Add the missing routes** to the §2 classification table with correct status + rationale:
   `admin.cby-staff` (users-adjacent, mock/CR-02), `admin.screen-permissions` (mock/CR-04),
   `bank.users` (mock/CR-02), `requests.index` (redirect), `requests.new` / `customs` /
   `workflows.instances.$id` (runtime, mock/CR-06).
3. **Update verdict, counts, readiness tables, recommendations** to reflect that
   notifications/requests/workflows are now **enabled live**, not merely "recommended".
4. **Add a short note** in the audit explaining why `*` is intentionally not used and which
   resources remain excluded (users, screen permissions, workflow authoring, request runtime).
5. **`.env.example` comments + key list** — add `notifications, requests, workflows`; drop the
   stale `users` from the example key list (no client exists).

## Out of scope

- No new `users.ts` client.
- No flipping of blocked operations (status actions, authoring, runtime, gate).
- No rewrite of CR content beyond id reconciliation and the new-screen rows.

## Behavior change

Exactly one line: the `VITE_API_RESOURCES` value in `.env`. Everything else is documentation.

## Acceptance

- `.env` lists the 11 keys; app builds and runs.
- notifications/requests/workflows read from the live API; their blocked operations still fall
  back to mock without error.
- Audit table includes every current route; no stale CR id remains in `.env.example`,
  `notifications.tsx`, or the two handoff docs.
- Audit contains the `*`-exclusion note.
