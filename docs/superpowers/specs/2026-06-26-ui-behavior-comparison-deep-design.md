# UI/Behavior Comparison Round 2: Tabs, Dialogs, and Validation Probes

## Purpose

Round 1 (`docs/superpowers/specs/2026-06-26-ui-behavior-comparison-design.md`)
captured one screenshot per top-level route, per role, per viewport, and
diffed pixels. That surfaced layout/data-rendering regressions but missed
everything that lives behind a click: tabs (e.g. `admin/workflows`' 7 tabs),
dialogs (add/edit/view on merchants, staff, teams, roles, orgs, entities),
and inner pages (workflow instance detail, stage actions). It also never
checked *behavior* — whether validation rules and submit outcomes (error
messages, success states) match between `main` (mock/localStorage) and
`live` (real API), since a screenshot pass can only catch differences that
are visually obvious.

This round extends the same tool to:
1. Capture screenshots of sub-states (tabs, dialogs, inner pages) that
   round 1 missed.
2. Script validation probes against every create/edit form, comparing the
   resulting error/success text between branches — not pixels.

## Scope

**Screenshot-only sub-states** (reachable via click, no form validation to
probe — just capture and pixel-diff like round 1):
- `admin/workflows`: all 7 tabs (`stages`, `stageRouting`, `transitions`,
  `assignments`, `fields`, `rules`, `actions`).
- View dialogs on: merchants, staff, entities (read-only detail popups).
- `workflows/instances/$id`: detail page sections (dynamic form tabs,
  history/activity log, actions panel) for at least one in-progress
  instance per role that can reach it.

**Probed forms** (script 2 cases each: one invalid input that must be
rejected, one valid input that must succeed then get cleaned up):
- Merchants: add/edit dialog.
- Admin → Staff: add/edit dialog.
- Admin → Teams: add/edit dialog.
- Admin → Roles: add/edit dialog.
- Admin → Orgs: add/edit dialog.
- Admin → Entities (banks): add/edit dialog.
- Admin → Reference Data: add table, add value.
- Requests (`workflows/new` flow): new request creation.
- Workflows/instances detail: stage action (approve/reject/return with
  comment), where the role has executor access to a stage.

Per-form validation rules and exact button/tab text/error strings are
already inventoried (see Implementation Notes below — sourced from a full
read of `merchants.tsx`, `admin.workflows.tsx`, `admin.staff.tsx`,
`admin.teams.tsx`, `admin.roles.tsx`, `admin.orgs.tsx`, `admin.entities.tsx`,
`admin.reference-data.tsx`, `admin.screen-permissions.tsx`,
`workflows.instances.$id.tsx`, `workflows.index.tsx`).

**Out of scope:**
- Multi-role approval chains (e.g. simulating a request moving through
  3 different roles' approvals in sequence).
- File upload fields.
- `admin/screen-permissions` (pure toggle matrix, no form validation to
  probe — could be added to screenshot-only list in a future round if
  needed, not required now).
- Fixing any regression the probes find — this round produces a punch
  list only, same as round 1.

## Architecture

Extends the existing round-1 pipeline in place (same files, same
worktree/port setup, same backend). Two new concerns layered on:

```
matrix.mjs (extended)
  └─ each screen entry gains optional:
       interactions: [ {type: "tab"|"dialog", trigger: "<button/tab text>"} ]
       probes: [ {id, trigger, fields: {...}, expectInvalid: "<error text>"} ,
                 {id, trigger, fields: {...}, expectValid: true, cleanup: "<delete trigger>"} ]
                          │
                          ▼
capture.mjs (extended)
  └─ after reaching base screen:
       - walk `interactions`: click each, screenshot resulting state
       - walk `probes`: fill fields, click trigger/submit, read result
         text via Playwright locator, write to probes.json;
         for expectValid cases, click `cleanup` trigger after capturing
         the success text, to delete the just-created record
                          │
                          ▼
output/ui-comparison/{branch}/{role}/{viewport}/{screen}__{subState}.png
output/ui-comparison/{branch}/probes.json
                          │
                          ▼
diff.mjs (extended)
  └─ existing pixelmatch path: now also covers the new __{subState} targets
  └─ new pass: load both branches' probes.json, exact-string-compare
     result text per probe id, append "Behavior Probe Results" table
                          │
                          ▼
docs/ui-comparison-report.md
  └─ existing screenshot diff table (extended with substate rows)
  └─ new: Behavior Probe Results table
       (role | form | probe id | main result | live result | match ✅/❌)
```

## Components

### 1. Matrix extension (`matrix.mjs`)
- Add `interactions` array to screen entries that have tabs/dialogs to
  reach. Each interaction step is `{ type: "tab" | "dialog", trigger,
  key }` — `trigger` is the exact button/tab text to click (Arabic,
  verbatim from the inventory), `key` is the sub-state's screenshot
  filename suffix.
- Add `probes` array to screen entries with forms. Each probe is
  `{ id, trigger (dialog-open button), fields: {label: value}, submit
  (submit button text), expect: { kind: "invalid" | "valid", text?
  (error string to match), cleanup? (delete button text) } }`.
- Exact validation rules, button text, and error strings come from the
  inventory already gathered (e.g. merchants: empty `name`/`tax` →
  submit disabled, "تعذّرت إضافة التاجر" on API failure; staff: invalid
  email → regex `/\S+@\S+\.\S+/` fails, submit disabled).

### 2. Capture extension (`capture.mjs`)
- After existing base-screen capture: for each `interactions` entry,
  click the trigger, wait for the resulting UI (tab content visible /
  dialog open), screenshot to `{screen}__{key}.png`.
- For each `probes` entry: open the dialog/form via `trigger`, fill
  fields via label, click `submit`. For `expect.kind === "invalid"`:
  assert the submit button is disabled OR an error message renders;
  capture the visible error text (or "submit disabled, no error shown"
  if no message appears — that distinction matters for the diff). For
  `expect.kind === "valid"`: assert success (toast text or dialog
  closed + new row visible), capture that confirmation text, then click
  `cleanup` trigger to delete the created record.
- Probe results append to an in-memory array, written once to
  `output/ui-comparison/{branch}/probes.json` at the end of the run —
  same failure-isolation rule as round 1 (a probe failure is logged, not
  fatal to the run).

### 3. Diff extension (`diff.mjs`)
- Screenshot diffing: no logic change, just runs over more filenames
  (the `__{key}` suffixed ones) automatically since it iterates whatever
  the matrix declares.
- Probe diffing: load `output/ui-comparison/main/probes.json` and
  `output/ui-comparison/live/probes.json`, match by probe `id`, compare
  result text with strict equality. Mismatch = ❌ row in the new report
  table. Missing probe result on either side = "missing" status (same
  rule as round 1: never fabricate a match).

## Error Handling

- Same rules as round 1: a single interaction/probe failure is logged
  (screen, role, interaction/probe id, error) and does not abort the
  run; backend going unreachable mid-run stops the run.
- A probe that creates a record but fails to clean it up (cleanup button
  missing/failed) is logged as a distinct warning in the report, naming
  the exact record (e.g. merchant name/tax number used in the probe
  input) — this needs human follow-up to manually remove it. This matters
  most on `live`, where the record lands in the real Laravel DB and
  persists across runs (`main`'s mock data lives in browser
  localStorage, which a worktree's fresh browser context starts clean
  each run, so leftover mock records don't accumulate the same way).

## Out of Scope (restated)

- No fixing of any regression this round finds.
- No CI integration.
- No multi-role/multi-step flow simulation.
- No file upload probing.
