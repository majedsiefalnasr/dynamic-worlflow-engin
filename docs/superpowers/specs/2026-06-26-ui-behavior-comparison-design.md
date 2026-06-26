# UI/Behavior Comparison: `main` (mock) vs `live` (API-wired)

## Purpose

The `live` branch wired ~54 files to the real backend API across nearly every
route. This is a 1:1 visual and structural comparison against `main` (the
mock-data reference UI) to surface UI and behavior regressions introduced
during the API wiring, giving a clear punch list for the next round of fixes.

## Scope

- **All screens**, both branches.
- **All 8 roles**, restricted to the screens each role can actually reach
  (per `src/lib/governance.ts` screen permissions + workflow-derived
  `requests` access).
- **Two viewports per screen**: desktop (1440×900) and mobile (375×812).
- **Backend:** local Laravel server at `http://localhost:8000`, already
  proxied via `vite.config.ts`. Confirmed reachable.

## Test Matrix

| Role | Screens |
|---|---|
| `rc_platform_admin` | Dashboard, Requests, Merchants, Reports, Audit, Notifications, Admin→Workflows, Admin→Reference Data, Admin→Screen Permissions, Admin→Entities, Admin→Orgs, Admin→Staff, Admin→Teams, Admin→Roles, Settings, Profile |
| `rc_bank_admin` | Dashboard, Requests, Merchants, Reports, Audit, Notifications, Profile |
| `rc_bank_intake` | Dashboard, Requests, Merchants, Notifications, Profile |
| `rc_bank_reviewer` | Dashboard, Requests, Notifications, Profile |
| `rc_bank_swift` | Dashboard, Requests, Notifications, Profile |
| `rc_support_member` | Dashboard, Requests, Reports, Audit, Notifications, Profile |
| `rc_executive_member` | Dashboard, Requests, Reports, Audit, Notifications, Profile |
| `rc_committee_manager` | Dashboard, Requests, Reports, Audit, Notifications, Profile |

Total: ~70 screen instances × 2 viewports × 2 branches ≈ 280 screenshots,
~140 comparison pairs.

## Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│ git worktree: main       │     │ current checkout: live   │
│ dev server :5174          │     │ dev server :5173          │
│ VITE_API_BASE_URL=""      │     │ VITE_API_BASE_URL=/api/v1 │
│ (mock/localStorage mode)  │     │ (real API mode)           │
└────────────┬─────────────┘     └────────────┬─────────────┘
             │                                 │
             └───────────┬─────────────────────┘
                          │ both proxy /api → localhost:8000
                          ▼
              Playwright capture script
              (role × screen × viewport)
                          │
                          ▼
              output/ui-comparison/{branch}/{role}/{viewport}/{screen}.png
                          │
                          ▼
              pixelmatch diff per pair
                          │
                          ▼
              docs/ui-comparison-report.md
```

## Components

### 1. Worktree setup
- `git worktree add ../code-rev-main-worktree main`
- Run `bun run dev` (or equivalent) in the worktree on port 5174, with
  `VITE_API_BASE_URL` unset/empty (mock mode, matches `main`'s default).
- Current `live` checkout keeps running its own dev server on port 5173
  with `VITE_API_BASE_URL=/api/v1` (already configured in `.env`).
- Both proxy backend calls to `localhost:8000`.

### 2. Capture script
Single Node script using Playwright (raw `playwright`, not test-runner, since
this is a one-off capture pass, not a CI suite):

- Data-driven role/screen matrix (table above) as a config object.
- Per branch port, per role:
  - Fresh browser context (no session bleed between roles).
  - **Live branch:** log in via email + `Password@123` through the real
    login form.
  - **Main branch:** log in via demo user picker → OTP bypass (mock flow).
  - For each screen the role can reach: navigate, wait for network idle,
    screenshot full page at each viewport.
- Output path: `output/ui-comparison/{branch}/{role}/{viewport}/{screen}.png`

### 3. Diff & report
- `pixelmatch` (installed as a devDependency) diffs each `main`/`live` pair
  at matching role/screen/viewport, producing a diff-percentage and a
  red-highlighted diff image.
- Diff images saved alongside captures: `output/ui-comparison/diff/...`
- `docs/ui-comparison-report.md`:
  - Top section: any screen that errored or failed to load on either
    branch (called out before the diff table, since these are the most
    actionable regressions).
  - Main table: role, screen, viewport, diff %, links to main/live/diff
    images — sorted by diff % descending.

## Error Handling

- If a screen/role combination fails to load (e.g. permission gate routes
  away, API error, crash), capture the failure (URL, error message,
  screenshot of whatever rendered) rather than aborting the whole run.
  Logged in the report's top section.
- If the local backend becomes unreachable mid-run, stop the run and report
  which captures completed vs. which are missing — do not generate
  misleading "0% diff" entries for uncaptured pairs.

## Out of Scope

- No automated interaction/flow testing (e.g. clicking through a full
  request approval). This pass is screenshot-based; behavior issues that
  aren't visually apparent are out of scope for this round.
- No CI integration — this is a one-off manual diagnostic run.
- No fixing of found issues as part of this task — output is a punch list
  for a follow-up implementation pass.
