# Convert Yemen Flow Hub to a Dynamic Workflow Engine

Refactor the architecture from hardcoded stages/roles/transitions into a JSON-configurable workflow engine, persisted to LocalStorage. **No visual redesign** — same colors, sidebar, typography, RTL layout, components.

## Scope

### 1. New engine layer (`src/lib/workflow-engine/`)

- `types.ts` — `WorkflowDefinition`, `WorkflowVersion`, `WorkflowStage`, `WorkflowTransition`, `WorkflowAction`, `StageAssignment`, `FieldDefinition`, `FieldRule`, `WorkflowInstance`, `WorkflowHistory`, `Organization`, `Team`, `Role`, `User`.
- `storage.ts` — typed LocalStorage CRUD (`wf:definitions`, `wf:versions`, `wf:stages`, `wf:transitions`, `wf:actions`, `wf:assignments`, `wf:fieldRules`, `wf:fieldDefs`, `wf:instances`, `wf:history`, `wf:orgs`, `wf:teams`, `wf:roles`, `wf:users`) + in-memory `useSyncExternalStore` cells so React reacts.
- `engine.ts` — pure functions: `getAvailableActions(instance, user)`, `canExecute(stageAssignments, user)`, `applyAction(instance, action, user, comment)` (writes history, advances `currentStageId` via matching transition), `getFieldRules(stageId)`, `getPublishedVersion(workflowCode)`, `cloneVersion`.
- `seed.ts` — installs the Import Financing workflow (8 stages, transitions, assignments, default actions, field rules, orgs/teams/roles/users from the brief) on first load if storage is empty.

### 2. Replace hardcoded request model

- Keep existing `requestsCell` shape externally but back it by `WorkflowInstance` + a `data: Record<string,unknown>` payload.
- Old `governance.ts` transitions → thin adapter calling `engine.applyAction`.
- Old role list in `mock.ts` → derived from seeded roles; auth user picks from seeded users.

### 3. Metadata-driven form renderer

- New `src/components/workflow/DynamicForm.tsx` — reads `FieldDefinition[]` + `FieldRule[]` for the current stage, renders `text|number|date|select|textarea|file|currency|checkbox`, enforces `visible/editable/required`.
- Refactor `requests.new.tsx` and `requests.$id.tsx` to use it for the request payload.
- Action buttons in `requests.$id.tsx` generated from `engine.getAvailableActions`.

### 4. Audit timeline

- Refactor existing `AuditTimeline.tsx` to read `WorkflowHistory` for the instance (stage, user, action, timestamp, comment). Immutable.

### 5. Workflow Designer (admin)

New route `src/routes/admin.workflows.tsx` + `admin.workflows.$id.tsx`:
- List/create workflow definitions and versions (clone, publish).
- Stages CRUD (no order-based routing — used only for display).
- Transitions table: from-stage × action → to-stage.
- Actions library (default 7 actions seeded, add custom).
- Assignments per stage (org/team/role/user picker).
- Field definitions + per-stage Field Rules grid (visible/editable/required).
- Saves to LocalStorage; existing instances keep their original `workflowVersionId`.

### 6. Org / Team / User admin

- Repurpose existing `admin.entities.tsx` → Organizations + Teams.
- Repurpose `admin.cby-staff.tsx` + `bank.users.tsx` → users CRUD with org/team/role bindings.
- Repurpose `admin.roles.tsx` → role CRUD.

All these screens keep current cards/tables/styling — only the data source changes.

### 7. Navigation & guards

- AppShell nav stays; add single "تصميم سير العمل" item under platform_admin pointing to `/admin/workflows`.
- Stage-buckets in `requests.index.tsx` derived from `engine.getStagesForUser(user)` instead of hardcoded `bucketsFor`.

## Files

**New**
- `src/lib/workflow-engine/{types,storage,engine,seed,hooks}.ts`
- `src/components/workflow/DynamicForm.tsx`
- `src/components/workflow/ActionButtons.tsx`
- `src/routes/admin.workflows.tsx`
- `src/routes/admin.workflows.$id.tsx`

**Refactor (logic only, UI preserved)**
- `src/lib/governance.ts` → adapter over engine
- `src/lib/mock.ts` → users/roles from engine
- `src/components/workflow/{AuditTimeline,VotingPanel,WorkflowProgress,RoleSwitcher}.tsx`
- `src/routes/requests.{index,$id,new}.tsx`
- `src/routes/{customs,audit,notifications,reports}.tsx`
- `src/routes/admin.{entities,cby-staff,roles,workflow-docs}.tsx`
- `src/routes/bank.users.tsx`
- `src/components/layout/AppShell.tsx` (only nav entry change)

## What stays exactly the same

- `src/styles.css`, Tailwind tokens, fonts, RTL direction.
- Sidebar layout, header, topbar widgets, notification popover, role switcher placement.
- Card / table / badge / button visual styles.
- Page headers, breadcrumbs, footer.
- Login screen.

## Out of scope

- No backend, no Lovable Cloud.
- No visual redesign or new component library.
- No drag-and-drop visual graph for transitions (table-based editor; can add later).
- Voting (committee tie-break) becomes one configurable action pattern; not a separate engine concept.

## Approach

Build the engine + seed first, verify a single request flows through 8 stages via dynamic actions, then refactor screens one-by-one keeping current markup. Migration on first load wipes/rebuilds workflow storage (prototype data — acceptable).
