# Yemen Import Financing Platform — Project Documentation

**منصة إدارة وتمويل الواردات — اللجنة الوطنية لتمويل الواردات**

A digital platform for managing, reviewing, and approving import financing requests for Yemen's National Committee for Import Financing (اللجنة الوطنية لتمويل الواردات). Built with a dynamic workflow engine that drives the entire request lifecycle — stages, transitions, permissions, and form fields are all configurable, not hardcoded.

## Tech Stack

- **Frontend:** React 19, Vite, TanStack Router (file-based routing), TanStack Query, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Laravel 11, Sanctum (bearer token auth), MySQL
- **State:** localStorage cells (mock/demo mode) or live API (production mode), gated per-resource by `VITE_API_RESOURCES`
- **Package manager:** bun

## Architecture

```
┌─────────────────────────────────────────┐
│ Frontend (React SPA)                     │
│  ├── src/routes/         File-based routes│
│  ├── src/lib/mock.ts     Demo identity   │
│  ├── src/lib/governance.ts Admin data    │
│  ├── src/lib/db.ts       Cell store      │
│  ├── src/lib/api/        Live API clients │
│  └── src/lib/workflow-engine/            │
│       ├── types.ts       Domain model    │
│       ├── engine.ts      Query + mutation│
│       ├── storage.ts     Persistent cells│
│       └── seed.ts        Demo data       │
├─────────────────────────────────────────┤
│ isApiEnabled("resource") gate            │
│  false → localStorage cells (mock)       │
│  true  → Live API via src/lib/api/*.ts   │
└─────────────────────────────────────────┘
```

The app runs in two modes:
- **Mock mode** (`VITE_API_BASE_URL` empty): all data in localStorage, demo accounts, no backend needed
- **Live mode** (`VITE_API_BASE_URL=/api/v1` + `VITE_API_RESOURCES=...`): selected resources use the real API, others fall back to mock

---

## Organizations & Roles

### Organization types (الجهات)

| Category | Arabic | Description |
|---|---|---|
| `banks` | البنوك التجارية | Commercial banks that submit import requests |
| `national_committee` | اللجنة الوطنية لتمويل الواردات | The review/approval committee |
| `other` (platform) | إدارة النظام | System administration |

### Roles (الأدوار)

| Code | Arabic | Org | Responsibility |
|---|---|---|---|
| `rc_platform_admin` | مسؤول نظام اللجنة | Platform | Full system access, all screens |
| `rc_bank_admin` | مسؤول البنك التجاري | Bank | Manages bank employees, views bank requests |
| `rc_bank_intake` | موظف إدخال البنك التجاري | Bank | Creates and fills import requests |
| `rc_bank_reviewer` | مراجع داخلي بالبنك التجاري | Bank | Reviews bank's requests internally |
| `rc_bank_swift` | موظف العمليات الخارجية | Bank | Handles FX/SWIFT operations |
| `rc_support_member` | عضو اللجنة المساندة | Committee | Support review of requests |
| `rc_executive_member` | عضو اللجنة التنفيذية | Committee | Executive decision-making |
| `rc_committee_manager` | مدير اللجنة التنفيذية | Committee | Committee management, FX confirmation |

### Teams (الفرق)

Each team belongs to an organization and holds users with a specific role:
- **Bank teams:** فريق الإدخال, فريق المراجعة الداخلية, فريق العمليات الخارجية, فريق الإدارة
- **Committee teams:** فريق اللجنة المساندة, فريق اللجنة التنفيذية, فريق تأكيد العمليات
- **Platform team:** إدارة النظام

---

## Screens & Navigation

### All screens

| Route | Arabic Label | Access | Description |
|---|---|---|---|
| `/` | اللوحة الرئيسية | All logged-in users | Dashboard: request stats (total/in-progress/closed/rejected), recent requests list |
| `/login` | تسجيل الدخول | Public | Two-step: credentials → MFA (OTP code) |
| `/workflows` | الطلبات | Screen permission: `requests` | Request list with search, stage filter, duplicate invoice warnings |
| `/workflows/instances/:id` | تفاصيل الطلب | Screen permission: `requests` | Request detail: progress bar, stage stepper, dynamic form, action buttons, history |
| `/merchants` | إدارة التجار | Screen permission: `merchants` | Merchant CRUD, bank-scoped (each bank sees only its merchants) |
| `/reports` | التقارير والتحليلات | Screen permission: `reports` | Summary cards, charts (by time, sector, currency) |
| `/audit` | التدقيق والامتثال | Screen permission: `audit` | Audit log viewer with search and export |
| `/notifications` | الإشعارات | All users | Notification list with mark-read, archive |
| `/admin/workflows` | مصمم سير العمل | `rc_platform_admin` | Workflow designer: stages, transitions, fields, permissions, actions |
| `/admin/reference-data` | البيانات الأساسية | `rc_platform_admin` | Reference tables: sector/activity, arrival port, origin country |
| `/admin/screen-permissions` | صلاحيات الشاشات | `rc_platform_admin` | Role × screen permission matrix editor |
| `/admin/entities` | إدارة البنوك | `rc_platform_admin` | Bank CRUD (name, license, activate/deactivate) |
| `/admin/orgs` | إدارة الجهات | `rc_platform_admin` | Organization management |
| `/admin/staff` | إدارة المستخدمين | `rc_platform_admin` | User management for all orgs (name, email, org, team, role, bank) |
| `/admin/teams` | إدارة الفرق | `rc_platform_admin` | Team management |
| `/admin/roles` | إدارة الأدوار | `rc_platform_admin` | Role catalog management |
| `/settings` | إعدادات النظام | `rc_platform_admin` | System configuration |
| `/profile` | الملف الشخصي | All users | User profile |

### Screen permission model

Two-tier permission system:
1. **Workflow-derived** (for `requests` screen): who can view/create/edit requests is derived from the workflow engine's stage assignments — if your role is assigned to any stage, you can view; if assigned with execute permission to the initial stage, you can create.
2. **Manual matrix** (for `merchants`, `reports`, `audit`): admin configures role × screen × capability (VIEW/CREATE/UPDATE/DELETE/EXPORT/MANAGE) via the screen-permissions editor. `MANAGE` implies all capabilities.

---

## Dynamic Workflow Engine

The core of the platform. Everything about how requests flow is **configurable**, not hardcoded.

### Domain model

```
WorkflowDefinition (e.g. "تمويل الواردات")
  └── WorkflowVersion (version 1, status: PUBLISHED)
        ├── Stages: ordered list of process stages
        │     ├── StageAssignment: who can execute/view each stage (by org/team/role)
        │     ├── FieldRule: which fields are visible/editable/required at this stage
        │     └── StageRoutingRule: display labels per audience (org/team/role)
        ├── Transitions: allowed moves between stages (with action names)
        ├── Actions: the operations (approve/reject/return/close/submit)
        ├── FieldDefinition: all form fields (name, type, validation)
        └── FieldGroup: field grouping (tabs in the form)
```

### Seeded workflow stages

The default "Import Financing Request" workflow has these stages:

| Order | Code | Arabic Name | Role that executes |
|---|---|---|---|
| 1 | CREATE | إنشاء الطلب | Bank intake (rc_bank_intake) |
| 2 | BANK_REVIEW | المراجعة الداخلية | Bank reviewer (rc_bank_reviewer) |
| 3 | SUPPORT_REVIEW | المراجعة المساندة | Support member (rc_support_member) |
| 4 | EXEC_DECISION | القرار التنفيذي | Executive member (rc_executive_member) |
| 5 | FX_OPS | عمليات الصرف | Bank SWIFT (rc_bank_swift) |
| 6 | FX_CONFIRM | تأكيد العمليات | Committee manager (rc_committee_manager) |
| 7 | EXEC_APPROVAL | الاعتماد النهائي | Executive member (rc_executive_member) |
| 8 | CUSTOMS | البيان الجمركي | Bank intake (rc_bank_intake) |

### Request lifecycle

1. **Create:** Bank intake user opens "طلب جديد" → `createInstance()` creates a request at the initial stage (CREATE), auto-generates reference number (IMP-YYYY-SEQNUM)
2. **Fill form:** The detail page renders a `DynamicForm` with fields driven by the stage's field rules. Fields are grouped into tabs (المعلومات الأساسية, بيانات الفاتورة, بيانات الشحن, الوثائق المطلوبة)
3. **Save draft:** User can save progress without advancing the stage
4. **Execute action:** User clicks an action button (e.g. "تقديم للمراجعة") → `applyAction()` validates permissions, moves to the next stage, logs history
5. **Stage progression:** Each stage has designated executors and viewers. Only the executor's actions are shown. The stage stepper shows progress through all stages.
6. **Completion:** When a request reaches a final stage and the executor approves, status becomes "closed" (مغلق)
7. **Rejection:** Some transitions lead to rejection (status "rejected" / مرفوض)

### Form fields (seeded)

The dynamic form includes these field types, all configurable per stage:

| Field | Type | Group |
|---|---|---|
| importerName | dynamic_select (merchants) | المعلومات الأساسية |
| companyName | dynamic_select (merchant_companies) | المعلومات الأساسية |
| taxNumber | text (auto-filled) | المعلومات الأساسية |
| linkedCompany | text (auto-filled) | المعلومات الأساسية |
| productCategory | dynamic_select (sector_activity ref table) | المعلومات الأساسية |
| destinationPorts | dynamic_select (arrival_port ref table) | بيانات الشحن |
| originCountry | dynamic_select (origin_country ref table) | بيانات الشحن |
| invoiceNumber | text | بيانات الفاتورة |
| invoiceDate | date | بيانات الفاتورة |
| invoiceAmount | currency | بيانات الفاتورة |
| invoiceCurrency | select (USD/EUR/SAR/YER) | بيانات الفاتورة |
| goodsDescription | textarea | المعلومات الأساسية |

### Key engine functions

| Function | What it does |
|---|---|
| `createInstance(opts)` | Create request at initial stage, generate IMP-YYYY-SEQ reference |
| `saveDraftData(id, data, user)` | Merge field data into request, log draft history |
| `applyAction(input)` | Validate permissions, execute transition, move stage, log history |
| `getAvailableActions(instance, user)` | Return transitions available from current stage for this user |
| `canExecute(stageId, user)` | Check if user has non-viewOnly assignment matching org/team/role |
| `canView(stageId, user)` | Check if user matches any assignment (execute or view) |
| `getStageFields(versionId, stageId)` | Return field definitions with stage-specific visibility/editability |
| `getViewerFields(versionId, user)` | Return fields visible to user across all their accessible stages |

---

## Authentication

### Login flow (mock mode)
1. Select demo account from the user picker
2. Enter password (demo: `Password@123`)
3. MFA verification (6-digit OTP code, pre-filled in demo)
4. Redirected to dashboard

### Login flow (live mode)
1. `POST /auth/login { email, password, device_name }` → returns bearer token + user object
2. Token stored in `sessionStorage` (survives page reload, clears on tab close)
3. On reload: `GET /auth/me` with stored token restores the session
4. MFA not yet implemented in backend (CR-05)

### Authorization
- **RoleGuard:** Simple role check — `allow: ["rc_platform_admin"]` blocks non-admin users
- **ScreenGuard:** Calls `canScreen(user, screen, capability)` — derives from workflow assignments (for requests) or manual permission matrix (for merchants/reports/audit)

---

## Data Layer

### Mock mode (localStorage cells)

All data stored in `localStorage` under namespace `cby.v2.*`:

| Cell | Key | Contains |
|---|---|---|
| `auditCell` | `cby.v2.audit` | Audit log entries |
| `notificationsCell` | `cby.v2.notifications` | User notifications |
| `merchantsCell` | `cby.v2.merchants` | Merchant records |
| `entitiesCell` | `cby.v2.entities` | Bank records |
| `referenceTablesCell` | `cby.v2.referenceTables` | Reference data (sectors, ports, countries) |
| `orgsCell` | `cby.v2.orgs` | Organizations |
| `teamsCell` | `cby.v2.teams` | Teams |
| `roleCatalogCell` | `cby.v2.roleCatalog` | Role definitions |
| `screenPermsCell` | `cby.v2.screenPerms` | Screen permission matrix |
| `wfStore.*` | `wfe:*` | Workflow engine state (definitions, versions, stages, instances, history, etc.) |

### Live mode (API clients)

Each resource has a thin client at `src/lib/api/<resource>.ts`:

| Client | Endpoints | Key exports |
|---|---|---|
| `auth.ts` | `/auth/login`, `/auth/me`, `/auth/logout` | `login()`, `logout()`, `mapApiUserToAppUser()` |
| `banks.ts` | `/banks` CRUD + activate/deactivate | `useBanksQuery()`, `useBankMutations()` |
| `organizations.ts` | `/organizations` CRUD + activate/deactivate | `useOrganizationsQuery()`, `useOrgMutations()` |
| `teams.ts` | `/teams` CRUD + activate/deactivate | `useTeamsQuery()`, `useTeamMutations()` |
| `roles.ts` | `/roles` CRUD + activate/deactivate | `useRolesQuery()`, `useRoleMutations()` |
| `users.ts` | `/users` CRUD + activate/deactivate | `useUsersQuery()`, `useUserMutations()` |
| `merchants.ts` | `/merchants` CRUD + suspend/activate | `useMerchantsQuery()`, `useMerchantMutations()` |
| `reference-data.ts` | `/reference-tables`, `/reference-values` | `useReferenceQuery()`, `useReferenceMutations()` |
| `requests.ts` | `/requests` list/detail/create/draft/action/history | `useRequestsQuery()`, `useRequestDetailQuery()`, `useRequestMutations()` |
| `reports.ts` | `/reports/*` | `useReportsSummary()`, chart queries |
| `audit.ts` | `/audit-logs` | `useAuditQuery()` |
| `notifications.ts` | `/notifications` | `useNotificationsQuery()` |
| `workflow-designer.ts` | `/workflows`, `/workflow-versions/*` | `useWorkflowSync()` |

### Pattern: controller hook

Every migrated screen uses the same pattern:
```typescript
function useXController() {
  const apiEnabled = isApiEnabled("resource");
  const liveQuery = useXQuery(apiEnabled);
  const liveMutations = useXMutations();

  if (apiEnabled) {
    return { /* live path: React Query data + mutations */ };
  }
  return { /* mock path: localStorage cell data + direct mutations */ };
}
```

---

## Key UI Components

| Component | Location | Purpose |
|---|---|---|
| `DynamicForm` | `src/components/workflow/DynamicForm.tsx` | Renders form fields from workflow engine config, with tabs (field groups), visibility/editability per stage, special handling for merchant/company auto-fill |
| `OrgProcessStepper` | `src/components/workflow/OrgProcessStepper.tsx` | Vertical stage timeline showing done/current/pending stages, marks "your turn" stages |
| `RoleSwitcher` | `src/components/workflow/RoleSwitcher.tsx` | Demo-mode user switcher dropdown (hidden in production) |
| `ScreenGuard` | `src/components/workflow/ScreenGuard.tsx` | Wraps screens with permission checks, shows unauthorized message if blocked |
| `RoleGuard` | `src/components/workflow/RoleGuard.tsx` | Simple role-list check, blocks non-matching roles |
| `AppShell` | `src/components/layout/AppShell.tsx` | Main layout: sidebar nav (role-filtered), header (user/notifications/theme/RoleSwitcher), content area |

---

## Role-Based Views

**Important:** The platform admin (`rc_platform_admin`) sees everything — all screens, all requests, all stages. Other roles see a **restricted view** driven by two systems:

### 1. Sidebar visibility (which screens appear)

Each nav item has either a `roles` check (admin-only screens) or a `screen` check (workflow/manual permission). A bank intake user (`rc_bank_intake`) would only see:
- اللوحة الرئيسية (dashboard — always visible)
- الطلبات (requests — if assigned to any workflow stage)
- إدارة التجار (merchants — if granted via screen permissions)
- الإشعارات (notifications — always visible)

They would **not** see: مصمم سير العمل, البيانات الأساسية, صلاحيات الشاشات, إدارة البنوك, إدارة الجهات, إدارة المستخدمين, إدارة الفرق, إدارة الأدوار, إعدادات النظام (all admin-only).

### 2. Request visibility (which requests appear)

- **Admin:** sees all 16 requests in all stages
- **Bank user:** sees only requests belonging to their bank
- **Committee user:** sees requests that have reached a stage they're assigned to

### 3. Request detail (what actions are available)

On the detail page (`/workflows/instances/:id`):
- **Executor** (user assigned to current stage with execute permission): sees action buttons (approve/reject/submit), can edit form fields, can save draft
- **Viewer** (user assigned to current stage with view-only permission): sees form fields as read-only, no action buttons
- **Others:** see "عرض فقط" (view only) with limited field visibility determined by `getViewerFields()` — only fields from stages the user has access to
- **Admin override:** platform admin sees all fields and can execute any action regardless of stage assignment

### 4. Stage stepper (which stages appear)

The `OrgProcessStepper` component filters stages by the user's audience (org/team/role routing rules). A bank user sees only bank-relevant stages; a committee user sees committee stages. Admin sees all stages. Stages the user can act on are marked "دورك" (your turn).

### 5. Merchant bank-scoping

- Bank users see only their bank's merchants (`bank_id` filter)
- Admin sees all merchants across all banks
- Creating a merchant from a bank account auto-assigns it to that bank

### 6. Screen permissions matrix

The admin can configure per-role, per-screen capabilities via `/admin/screen-permissions`:
- **VIEW** — can see the screen
- **CREATE** — can add new records
- **UPDATE** — can edit existing records  
- **DELETE** — can remove records
- **EXPORT** — can export data
- **MANAGE** — implies all of the above

This controls access to merchants, reports, and audit screens. The requests screen permissions are derived from the workflow engine instead.

---

## Merchant Management

- Each merchant belongs to a bank (`bank_id`)
- Bank users can only see/edit their own bank's merchants (bank-scoped)
- Tax number must be unique **per bank** (not globally) — bank 1 and bank 2 can each have a merchant with tax number "111"
- Merchant detail includes: owners (name + ownership percentage), linked companies (name + commercial registration + sector)
- Sector comes from the `sector_activity` reference table

---

## Environment Variables

```env
# Backend API base URL — leave empty for full mock mode
VITE_API_BASE_URL=/api/v1

# Which resources use the live API (comma-separated, or * for all)
# Keys: reference-data, organizations, teams, roles, banks, merchants,
#        reports, audit, notifications, requests, workflows, users
VITE_API_RESOURCES=reference-data,organizations,teams,roles,banks,merchants,reports,audit,notifications,requests,workflows,users
```

---

## Backend Integration Status

See [docs/backend-handoff/BACKEND-CHANGE-REQUESTS.md](backend-handoff/BACKEND-CHANGE-REQUESTS.md) for the complete list of backend requirements, what's closed, and what's still blocking.

See [docs/backend-handoff/AUDIT.md](backend-handoff/AUDIT.md) for the per-screen classification of what uses the live API vs. mock data.
