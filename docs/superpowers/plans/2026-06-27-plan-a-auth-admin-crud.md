# Plan A: Auth + User Type Evolution + Admin CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire auth, 5 admin CRUD resources (orgs/teams/roles/banks/users), and screen permissions to the live backend, following the adapter pattern from reference-data.

**Architecture:** Per-resource adapter in `src/lib/data/` makes mock-vs-live decision behind a stable contract. Screens import only the adapter hooks. Auth is gated by `hasApiBase()` not `source()`. Domain types evolve to match backend shapes — cross-cutting rename wave first, then adapters.

**Tech Stack:** React 19, TanStack Query + Router, Vite 7, bun, TypeScript, Vitest

## Global Constraints

1. No source branching in UI — screens never check `apiEnabled`, env, or `source()`.
2. UI branches on `error.kind` only — never on HTTP status.
3. Adapter independence — no adapter imports another adapter.
4. Keys via `<resource>Keys` factory — never inline query key strings.
5. No behavior change — mock mode identical to current app.
6. Mock is default — no `VITE_API_BASE_URL` = everything mock.
7. Data layer in `src/lib/data/`.
8. Cell-as-cache — live adapter hydrates cells for sync helper compat.
9. Blocked writes — WAF-blocked ops use PATCH workaround or reject `kind:"blocked"`.
10. All Arabic — error messages, loading text.
11. Build gates after each task: `bunx tsc --noEmit`, `bunx vitest run`, `bunx eslint .`, `bunx vite build`.
12. Prettier: run `bunx prettier --write` on all new/changed files before committing.

---

### Task 0: User type evolution + cross-cutting rename

Evolve the `User` type in `mock.ts` to match backend `UserResource` shape, update `DEMO_USERS`, and fix all ~22 files that read User fields. This is the foundation — everything else depends on it.

**Files:**
- Modify: `src/lib/mock.ts` — User type, DEMO_USERS, ROLE_LABELS → getRoleLabel(), AuthSnapshot
- Modify: `src/lib/governance.ts` — update audit seed that reads DEMO_USERS
- Modify: `src/lib/workflow-bridge.ts` — wfUserFromAccount field mapping
- Modify: `src/routes/login.tsx` — ROLE_LABELS → user.roleLabel
- Modify: `src/routes/index.tsx` — ROLE_LABELS → user.roleLabel
- Modify: `src/routes/profile.tsx` — ROLE_LABELS, user.org, user.roleId display
- Modify: `src/routes/workflows.index.tsx` — useAuth only (no field changes needed)
- Modify: `src/routes/workflows.instances.$id.tsx` — useAuth only
- Modify: `src/routes/bank.users.tsx` — entityId → bankId, orgKind, teamId, DEMO_USERS fields
- Modify: `src/routes/admin.cby-staff.tsx` — entityId → bankId, orgKind, teamId, DEMO_USERS fields
- Modify: `src/routes/admin.roles.tsx` — DEMO_USERS role counting
- Modify: `src/routes/admin.orgs.tsx` — DEMO_USERS orgKind filtering
- Modify: `src/routes/admin.teams.tsx` — DEMO_USERS teamId filtering
- Modify: `src/routes/admin.entities.tsx` — Entity type usage
- Modify: `src/routes/admin.screen-permissions.tsx` — useAuth only
- Modify: `src/routes/merchants.tsx` — ENTITIES usage
- Modify: `src/routes/notifications.tsx` — useAuth only
- Modify: `src/components/layout/AppShell.tsx` — user.org, ROLE_LABELS, user.avatar
- Modify: `src/components/workflow/RoleGuard.tsx` — RoleId type (no change needed)
- Modify: `src/components/workflow/RoleSwitcher.tsx` — ROLE_LABELS, DEMO_USERS
- Modify: `src/components/workflow/ScreenGuard.tsx` — useAuth only (no change needed)

**Interfaces:**
- Produces: `User` type with fields `id: number`, `name`, `email`, `roleId: string` (role.code), `roleLabel: string`, `role: {id,code,name}|null`, `organization: {id,code,name}|null`, `team: {id,code,name}|null`, `bank: {id,code,name}|null`, `bankId: number|null`, `isActive: boolean`, `avatar: string`, `phone?: string`, `screenPermissions: ScreenPermission[]`, `capabilities: string[]`, `_version?: number`
- Produces: `ScreenPermission` type: `{ screen: string; capabilities: string[] }`
- Produces: `getRoleLabel(roleId: string): string` — reads from `roleCatalogCell` for mock, replaces `ROLE_LABELS` map
- Produces: `computeAvatar(name: string): string` — first char of first + last name parts

- [ ] **Step 1: Update User type in mock.ts**

Replace the existing `User` type and add helper types/functions:

```ts
export type ScreenPermission = {
  screen: string;
  capabilities: string[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  roleId: RoleId;
  roleLabel: string;
  role: { id: number; code: string; name: string } | null;
  organization: { id: number; code: string; name: string } | null;
  team: { id: number; code: string; name: string } | null;
  bank: { id: number; code: string; name: string } | null;
  bankId: number | null;
  isActive: boolean;
  avatar: string;
  phone?: string;
  screenPermissions: ScreenPermission[];
  capabilities: string[];
  _version?: number;
};

export function computeAvatar(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0]?.[0] ?? "";
  return (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "");
}
```

Remove the exported `ROLE_LABELS` constant. Add `getRoleLabel`:

```ts
export function getRoleLabel(roleId: string): string {
  // Lazy import avoided: governance.ts already imports from mock.ts.
  // Use a simple local map for mock mode; live mode uses user.roleLabel.
  const MOCK_ROLE_LABELS: Record<string, string> = {
    rc_platform_admin: "مدير النظام",
    rc_bank_admin: "مدير البنك",
    rc_bank_intake: "موظف الإدخال",
    rc_bank_reviewer: "مراجع داخلي",
    rc_bank_swift: "عمليات خارجية",
    rc_support_member: "عضو لجنة مساندة",
    rc_executive_member: "عضو لجنة تنفيذية",
    rc_committee_manager: "مدير عمليات اللجنة",
  };
  return MOCK_ROLE_LABELS[roleId] ?? roleId;
}
```

- [ ] **Step 2: Update DEMO_USERS array**

Replace with new shape. Each user gets numeric `id`, nested `role`/`organization`/`team`/`bank` objects, `avatar` computed, `screenPermissions: []`, `capabilities: []`:

```ts
export const DEMO_USERS: User[] = [
  {
    id: 1, name: "ياسر الحضرمي", email: "admin@cby.gov.ye",
    roleId: "rc_platform_admin", roleLabel: "مدير النظام",
    role: { id: 1, code: "rc_platform_admin", name: "مدير النظام" },
    organization: { id: 3, code: "platform", name: "إدارة النظام" },
    team: { id: 8, code: "team_platform_admin", name: "إدارة النظام" },
    bank: null, bankId: null,
    isActive: true, avatar: "يح", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 4, name: "أحمد المقطري", email: "admin@ybank.ye",
    roleId: "rc_bank_admin", roleLabel: "مدير البنك",
    role: { id: 2, code: "rc_bank_admin", name: "مدير البنك" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 4, code: "team_admin_bank", name: "فريق الإدارة (البنك)" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true, avatar: "أم", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 5, name: "علي القاضي", email: "intake@ybank.ye",
    roleId: "rc_bank_intake", roleLabel: "موظف الإدخال",
    role: { id: 3, code: "rc_bank_intake", name: "موظف الإدخال" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 1, code: "team_entry", name: "فريق الإدخال" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true, avatar: "عق", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 6, name: "نوال الحاج", email: "reviewer@ybank.ye",
    roleId: "rc_bank_reviewer", roleLabel: "مراجع داخلي",
    role: { id: 4, code: "rc_bank_reviewer", name: "مراجع داخلي" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 2, code: "team_internal", name: "فريق المراجعة الداخلية" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true, avatar: "نح", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 2, name: "محمد الشامي", email: "m.shami@cby.gov.ye",
    roleId: "rc_support_member", roleLabel: "عضو لجنة مساندة",
    role: { id: 6, code: "rc_support_member", name: "عضو لجنة مساندة" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 5, code: "team_support", name: "فريق اللجنة المساندة" },
    bank: null, bankId: null,
    isActive: true, avatar: "مش", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 7, name: "سامي العتمي", email: "swift@ybank.ye",
    roleId: "rc_bank_swift", roleLabel: "عمليات خارجية",
    role: { id: 5, code: "rc_bank_swift", name: "عمليات خارجية" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 3, code: "team_fx", name: "فريق العمليات الخارجية" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true, avatar: "سع", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 9, name: "د. هدى الإرياني", email: "huda@cby.gov.ye",
    roleId: "rc_committee_manager", roleLabel: "مدير عمليات اللجنة",
    role: { id: 8, code: "rc_committee_manager", name: "مدير عمليات اللجنة" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 7, code: "team_fx_confirm", name: "فريق تأكيد العمليات" },
    bank: null, bankId: null,
    isActive: true, avatar: "هإ", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 10, name: "م. سامي الذماري", email: "sami@cby.gov.ye",
    roleId: "rc_executive_member", roleLabel: "عضو لجنة تنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو لجنة تنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null, bankId: null,
    isActive: true, avatar: "سذ", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 11, name: "د. ندى الكبسي", email: "nada@cby.gov.ye",
    roleId: "rc_executive_member", roleLabel: "عضو لجنة تنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو لجنة تنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null, bankId: null,
    isActive: true, avatar: "نك", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 12, name: "أ. فهد الشرعبي", email: "fahd@cby.gov.ye",
    roleId: "rc_executive_member", roleLabel: "عضو لجنة تنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو لجنة تنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null, bankId: null,
    isActive: true, avatar: "فش", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 13, name: "د. أمينة العزب", email: "amina@cby.gov.ye",
    roleId: "rc_executive_member", roleLabel: "عضو لجنة تنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو لجنة تنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null, bankId: null,
    isActive: true, avatar: "أع", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
  {
    id: 14, name: "م. خالد الأنسي", email: "khaled@cby.gov.ye",
    roleId: "rc_executive_member", roleLabel: "عضو لجنة تنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو لجنة تنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null, bankId: null,
    isActive: true, avatar: "خأ", phone: undefined,
    screenPermissions: [], capabilities: [],
  },
];
```

- [ ] **Step 3: Update USERS_KEY deserialization**

The `loadStoredUsers()` function currently normalizes `role` → `roleId`. Update it to handle the evolved shape. Old stored users (string IDs, flat fields) should still be handled gracefully — if the stored shape is old, discard it and use fresh defaults:

```ts
function loadStoredUsers(): User[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0] as Record<string, unknown>;
    // Detect old shape: string id or missing role object → discard
    if (typeof first.id === "string" || !("role" in first)) return null;
    return parsed as User[];
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Update BUILTIN_ACCOUNT_TO_WF_USER in workflow-bridge.ts**

The keys change from string IDs ("u1", "u4", etc.) to numeric IDs (1, 4, etc.):

```ts
const BUILTIN_ACCOUNT_TO_WF_USER: Record<number, string> = {
  1: "wu_platform_admin",
  4: "wu_bank_admin",
  5: "wu_intake_officer",
  6: "wu_internal_reviewer",
  7: "wu_swift_officer",
  2: "wu_support_member",
  9: "wu_committee_manager",
  10: "wu_exec_member",
  11: "wu_exec_member",
  12: "wu_exec_member",
  13: "wu_exec_member",
  14: "wu_exec_member",
};
```

- [ ] **Step 5: Update wfUserFromAccount in workflow-bridge.ts**

Replace field references for the new User shape:

```ts
export function wfUserFromAccount(user: User | null | undefined): WfUser | null {
  if (!user) return null;
  const orgRaw = user.organization?.code ?? "bank";
  const organizationId = ORG_ID_ALIASES[orgRaw] ?? orgRaw;
  const roleEngine = ROLE_ID_ALIASES[user.roleId] ?? user.roleId;
  return {
    id: `wfu_${user.id}`,
    fullName: user.name,
    email: user.email,
    organizationId,
    teamIds: user.team?.code ? [user.team.code] : [],
    roleIds: [roleEngine],
  };
}
```

Also update `getWorkflowUser` and `syncWorkflowUser` to use `user.id` (now `number`) — the `BUILTIN_ACCOUNT_TO_WF_USER` lookup key type changes.

- [ ] **Step 6: Cross-cutting field renames in all consuming files**

Apply these mechanical replacements across all files listed in the spec §3.5. The exact patterns:

| Old pattern | New pattern |
|---|---|
| `ROLE_LABELS[user.roleId]` or `ROLE_LABELS[u.roleId]` | `user.roleLabel` or `u.roleLabel` |
| `ROLE_LABELS[selected.roleId]` | `selected.roleLabel` |
| `import { ... ROLE_LABELS ... }` | remove `ROLE_LABELS` from import; add `getRoleLabel` if needed for non-user contexts |
| `user.entityId` | `user.bankId` |
| `u.entityId` | `u.bankId` |
| `user.org` (the string) | `user.organization?.name ?? "—"` |
| `u.org` | `u.organization?.name ?? "—"` |
| `user.orgKind` | `user.organization?.code` |
| `u.orgKind` | `u.organization?.code` |
| `user.teamId` | `user.team?.code` (for code lookups) or `user.team?.id` (for numeric) |
| `user.active` / `u.active` | `user.isActive` / `u.isActive` |
| `user.id === u.id` (string compare) | `user.id === u.id` (number compare — same syntax, types changed) |

For screens that read `DEMO_USERS` for user management (admin.cby-staff.tsx, bank.users.tsx, admin.roles.tsx, admin.orgs.tsx), update the Payload types and mutation code to match new field names.

For `AppShell.tsx`: update the user avatar display, `user.org` → `user.organization?.name ?? "—"`, remove `ROLE_LABELS` import.

For `RoleSwitcher.tsx`: `ROLE_LABELS[u.roleId]` → `u.roleLabel`.

For `login.tsx`: `ROLE_LABELS[u.roleId]` → `u.roleLabel`, `ROLE_LABELS[selected.roleId]` → `selected.roleLabel`.

- [ ] **Step 7: Update governance.ts audit seed**

The audit seed references `DEMO_USERS[0].id` — now numeric. Also the `ENTITIES` import from mock.ts: if `Entity` type changed (deferred to banks task), keep it as-is for now. Only fix the `userId: DEMO_USERS[0].id` → `userId: String(DEMO_USERS[0].id)` since `AuditEntry.userId` is `string`.

- [ ] **Step 8: Run all build gates**

```bash
bunx prettier --write src/lib/mock.ts src/lib/workflow-bridge.ts src/lib/governance.ts src/routes/login.tsx src/routes/index.tsx src/routes/profile.tsx src/routes/bank.users.tsx src/routes/admin.cby-staff.tsx src/routes/admin.roles.tsx src/routes/admin.orgs.tsx src/routes/admin.teams.tsx src/routes/admin.entities.tsx src/routes/admin.screen-permissions.tsx src/routes/merchants.tsx src/routes/notifications.tsx src/components/layout/AppShell.tsx src/components/workflow/RoleSwitcher.tsx
bunx tsc --noEmit
bunx vitest run
bunx eslint .
bunx vite build
```

All must pass. Fix any type errors introduced by the field renames.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: evolve User type to match backend UserResource shape"
```

---

### Task 1: Auth adapter + 401 interceptor

Create the auth adapter module and add global 401 handling to `http.ts`.

**Files:**
- Create: `src/lib/data/auth.ts`
- Create: `src/lib/data/auth.test.ts`
- Modify: `src/lib/data/http.ts` — add 401 interceptor

**Interfaces:**
- Consumes: `User` type from `src/lib/mock.ts`, `computeAvatar` from `src/lib/mock.ts`, `tokenStore` and `api` from `src/lib/data/http.ts`, `hasApiBase` from `src/lib/data/source.ts`, `auth` from `src/lib/mock.ts`, `syncWorkflowUser` from `src/lib/workflow-bridge.ts`
- Produces: `login(email: string, password: string): Promise<User>` — POST /auth/login, stores token, maps DTO, calls auth.login + syncWorkflowUser
- Produces: `fetchMe(): Promise<User>` — GET /auth/me, maps DTO, calls auth.login + syncWorkflowUser
- Produces: `logout(): Promise<void>` — POST /auth/logout (fire-and-forget), clears token, calls auth.logout
- Produces: `toUser(dto: UserResourceDto): User` — mapper function (exported for testing)
- Produces: `isLive(): boolean` — returns `hasApiBase()`

- [ ] **Step 1: Write mapper test**

```ts
// src/lib/data/auth.test.ts
import { describe, expect, test } from "vitest";
import { toUser } from "./auth";

describe("toUser mapper", () => {
  test("maps UserResource DTO to domain User", () => {
    const dto = {
      id: 5,
      version: 2,
      name: "علي القاضي",
      email: "intake@ybank.ye",
      role_id: 3,
      role: { id: 3, code: "rc_bank_intake", name: "موظف الإدخال" },
      role_label: "موظف الإدخال",
      organization: { id: 1, code: "bank", name: "البنوك التجارية" },
      team: { id: 1, code: "team_entry", name: "فريق الإدخال" },
      bank_id: 1,
      bank_name: "البنك اليمني",
      bank: { id: 1, code: "ybank", name: "البنك اليمني" },
      is_active: true,
      screen_permissions: [{ screen: "merchants", capabilities: ["VIEW"] }],
      capabilities: ["VIEW", "CREATE"],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const user = toUser(dto);
    expect(user.id).toBe(5);
    expect(user.roleId).toBe("rc_bank_intake");
    expect(user.roleLabel).toBe("موظف الإدخال");
    expect(user.organization).toEqual({ id: 1, code: "bank", name: "البنوك التجارية" });
    expect(user.bankId).toBe(1);
    expect(user.avatar).toBe("عق");
    expect(user.screenPermissions).toEqual([{ screen: "merchants", capabilities: ["VIEW"] }]);
    expect(user._version).toBe(2);
  });

  test("handles null nested objects", () => {
    const dto = {
      id: 1, version: 1, name: "تست", email: "t@t.com",
      role_id: null, role: null, role_label: null,
      organization: null, team: null,
      bank_id: null, bank_name: null, bank: null,
      is_active: true,
      screen_permissions: [], capabilities: [],
      created_at: null, updated_at: null,
    };
    const user = toUser(dto);
    expect(user.role).toBeNull();
    expect(user.organization).toBeNull();
    expect(user.bankId).toBeNull();
    expect(user.roleId).toBe("");
    expect(user.roleLabel).toBe("");
  });
});
```

- [ ] **Step 2: Implement auth adapter**

```ts
// src/lib/data/auth.ts
import { api, tokenStore } from "./http";
import { hasApiBase } from "./source";
import { auth, computeAvatar, type User } from "@/lib/mock";
import { syncWorkflowUser } from "@/lib/workflow-bridge";

interface UserResourceDto {
  id: number;
  version?: number;
  name: string;
  email: string;
  role_id: number | null;
  role: { id: number; code: string; name: string } | null;
  role_label: string | null;
  organization: { id: number; code: string; name: string } | null;
  team: { id: number; code: string; name: string } | null;
  bank_id: number | null;
  bank_name: string | null;
  bank: { id: number; code: string; name: string } | null;
  is_active: boolean;
  screen_permissions: { screen: string; capabilities: string[] }[];
  capabilities: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface LoginResponse {
  user: UserResourceDto;
  token: string;
  token_type: string;
  mode: string;
}

export function toUser(dto: UserResourceDto): User {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    roleId: dto.role?.code ?? "",
    roleLabel: dto.role?.name ?? dto.role_label ?? "",
    role: dto.role,
    organization: dto.organization,
    team: dto.team,
    bank: dto.bank,
    bankId: dto.bank_id,
    isActive: dto.is_active,
    avatar: computeAvatar(dto.name),
    phone: undefined,
    screenPermissions: dto.screen_permissions ?? [],
    capabilities: dto.capabilities ?? [],
    _version: dto.version,
  };
}

export function isLive(): boolean {
  return hasApiBase();
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<LoginResponse>("/auth/login", { email, password });
  tokenStore.set(res.token);
  const user = toUser(res.user);
  auth.login(user);
  syncWorkflowUser(user);
  return user;
}

export async function fetchMe(): Promise<User> {
  const dto = await api.get<UserResourceDto>("/auth/me");
  const user = toUser(dto);
  auth.login(user);
  syncWorkflowUser(user);
  return user;
}

export async function logout(): Promise<void> {
  api.post("/auth/logout").catch(() => {});
  tokenStore.clear();
  auth.logout();
}
```

- [ ] **Step 3: Add 401 interceptor to http.ts**

In `http.ts`, after the `throw mapHttpError(...)` line inside the `request()` function, add a check that clears auth on 401:

```ts
// Inside request(), after: const body = await parse(res);
if (!res.ok) {
  if (res.status === 401) {
    tokenStore.clear();
    // Dynamic import to avoid circular dep (auth imports http, http can't import auth)
    import("@/lib/mock").then((m) => m.auth.logout()).catch(() => {});
  }
  throw mapHttpError(res.status, body, res.headers.get("content-type") ?? undefined);
}
```

- [ ] **Step 4: Run tests and build gates**

```bash
bunx prettier --write src/lib/data/auth.ts src/lib/data/auth.test.ts src/lib/data/http.ts
bunx tsc --noEmit
bunx vitest run
bunx eslint .
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/auth.ts src/lib/data/auth.test.ts src/lib/data/http.ts
git commit -m "feat(data): add auth adapter + 401 interceptor"
```

---

### Task 2: Login screen rewire + session rehydration + logout

Wire the login screen to use the auth adapter in live mode, add session rehydration in `__root.tsx`, and wire live logout in AppShell. Update handoff docs.

**Files:**
- Modify: `src/routes/login.tsx` — live/mock login branch
- Modify: `src/routes/__root.tsx` — session rehydration on app start
- Modify: `src/components/layout/AppShell.tsx` — live logout
- Modify: `src/components/workflow/RoleSwitcher.tsx` — hide in live mode
- Modify: `docs/backend-handoff/UI-CHANGES.md` — UC-01, UC-02

**Interfaces:**
- Consumes: `login(email, password)`, `fetchMe()`, `logout()`, `isLive()` from `src/lib/data/auth.ts`
- Consumes: `hasApiBase()` from `src/lib/data/source.ts`
- Consumes: `tokenStore` from `src/lib/data/http.ts`

- [ ] **Step 1: Update login.tsx**

The login screen needs two code paths based on `isLive()`:

**Mock mode (when `isLive()` is false):** identical to current behavior — demo picker, fake OTP, `auth.login(demoUser)`.

**Live mode (when `isLive()` is true):**
- Step 1 ("login"): email + password form. No demo picker. Submit stores email/password in local state, moves to OTP step.
- Step 2 ("otp"): pre-filled OTP inputs (decorative). Submit calls `login(email, password)` from auth adapter. On success → navigate("/"). On error → toast.error with the error message, go back to step 1.

Key imports to add: `import { login as authLogin, isLive } from "@/lib/data/auth"` and `import { isDomainError } from "@/lib/data/errors"`.

In live mode, do NOT import `DEMO_USERS` or `ROLE_LABELS` — they're only used for mock mode.

Add error/pending state: `const [loginError, setLoginError] = useState<string | null>(null)` and `const [isPending, setIsPending] = useState(false)`.

The live OTP submit handler:

```ts
const handleOtpLive = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsPending(true);
  setLoginError(null);
  try {
    await authLogin(email, password);
    nav({ to: "/" });
  } catch (err) {
    setLoginError(isDomainError(err) ? err.message : "فشل تسجيل الدخول");
    setStep("login");
  } finally {
    setIsPending(false);
  }
};
```

- [ ] **Step 2: Update __root.tsx — session rehydration**

In `RootLayout`, add a rehydration effect. Before `AuthGate` renders, if there's a token in sessionStorage, call `fetchMe()`:

```ts
import { useState, useEffect } from "react";
import { fetchMe, isLive } from "@/lib/data/auth";
import { tokenStore } from "@/lib/data/http";
import { Loader2 } from "lucide-react";

function RootLayout() {
  const { queryClient } = Route.useRouteContext();
  const [rehydrating, setRehydrating] = useState(() => isLive() && !!tokenStore.get());

  useEffect(() => {
    seedIfEmpty();
  }, []);

  useEffect(() => {
    if (!rehydrating) return;
    fetchMe()
      .catch(() => {}) // 401/network → stay logged out
      .finally(() => setRehydrating(false));
  }, [rehydrating]);

  if (rehydrating) {
    return (
      <div className="flex h-screen items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir="rtl">
        <AuthGate />
        <Toaster position="top-center" dir="rtl" />
      </DirectionProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Wire live logout in AppShell.tsx**

In the logout DropdownMenuItem's `onSelect` handler, use the auth adapter:

```ts
import { logout as authLogout, isLive } from "@/lib/data/auth";

// In the onSelect handler:
onSelect={async () => {
  if (isLive()) await authLogout();
  else auth.logout();
  nav({ to: "/login" });
}}
```

- [ ] **Step 4: Hide RoleSwitcher in live mode**

In `RoleSwitcher.tsx`, add the `hasApiBase()` gate:

```ts
import { hasApiBase } from "@/lib/data/source";

export function RoleSwitcher() {
  const { user } = useAuth();
  if (!user || hasApiBase()) return null;
  // ... rest unchanged
}
```

- [ ] **Step 5: Update UI-CHANGES.md**

Add UC-01 and UC-02 entries to the table in `docs/backend-handoff/UI-CHANGES.md`:

```
| UC-01 | login | Live mode: real email/password form replaces demo-user picker; OTP step stays as decorative placeholder | Demo picker cannot work against real backend; real credentials required | Login step 1 shows email+password only (no demo list); step 2 keeps OTP inputs pre-filled | Approved (brainstorming) |
| UC-02 | AppShell | RoleSwitcher hidden when live API base URL is set | Demo-only feature; switching users against live backend not meaningful | RoleSwitcher component returns null when hasApiBase() is true | Approved (brainstorming) |
```

- [ ] **Step 6: Run all build gates**

```bash
bunx prettier --write src/routes/login.tsx src/routes/__root.tsx src/components/layout/AppShell.tsx src/components/workflow/RoleSwitcher.tsx
bunx tsc --noEmit
bunx vitest run
bunx eslint .
bunx vite build
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/login.tsx src/routes/__root.tsx src/components/layout/AppShell.tsx src/components/workflow/RoleSwitcher.tsx docs/backend-handoff/UI-CHANGES.md
git commit -m "feat(auth): wire login screen, session rehydration, and live logout"
```

---

### Task 3: Governance type evolution (OrgRecord, TeamRecord, RoleCatalogEntry)

Evolve the three governance domain types to match backend shapes. Update cells, seed data, and all sync helpers.

**Files:**
- Modify: `src/lib/governance.ts` — OrgRecord, TeamRecord, RoleCatalogEntry types + seeds + helpers
- Create: `src/lib/data/governance.test.ts` — mapper tests for governance type conversions

**Interfaces:**
- Produces: `OrgRecord` with `id: number`, `code: string`, `label: string`, `category: OrgCategory`, `active: boolean`, `builtin: boolean`, `_version?: number`
- Produces: `TeamRecord` with `id: number`, `code: string`, `label: string`, `orgId: number`, `orgCode: string`, `roleCode?: string`, `active: boolean`, `builtin: boolean`, `_version?: number`
- Produces: `RoleCatalogEntry` with `id: number`, `code: string`, `name: string`, `orgId: number`, `orgCode: string`, `active: boolean`, `builtin: boolean`, `_version?: number`
- Produces: Sync helpers (`getOrgLabel`, `getOrgCategory`, `activeOrgs`, `getTeam`, `getTeamLabel`, `getTeamRole`, `activeTeamsByKind`, `getRoleCatalog`, `activeRolesByOrg`) — updated to accept `code: string` as lookup key

- [ ] **Step 1: Evolve OrgRecord type and seed data**

```ts
export type OrgRecord = {
  id: number;
  code: string;
  label: string;
  category: OrgCategory;
  active: boolean;
  builtin: boolean;
  _version?: number;
};

const DEFAULT_ORGS: OrgRecord[] = [
  { id: 1, code: "bank", label: "البنوك التجارية", active: true, builtin: true, category: "bank" },
  { id: 2, code: "committee", label: "اللجنة الوطنية لتمويل الواردات", active: true, builtin: true, category: "committee" },
  { id: 3, code: "platform", label: "إدارة النظام", active: true, builtin: true, category: "other" },
];
```

Update sync helpers to search by `code`:

```ts
export function getOrgCategory(org: OrgRecord | string | null | undefined): OrgCategory {
  const record = typeof org === "string"
    ? orgsCell.get().find((item) => item.code === org)
    : org;
  if (!record) return "other";
  return record.category;
}

export function getOrgLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return orgsCell.get().find((o) => o.code === code)?.label ?? code;
}

export function activeOrgs(): OrgRecord[] {
  return orgsCell.get().filter((o) => o.active);
}
```

- [ ] **Step 2: Evolve TeamRecord type and seed data**

```ts
export type TeamRecord = {
  id: number;
  code: string;
  label: string;
  orgId: number;
  orgCode: string;
  roleCode?: string;
  active: boolean;
  builtin: boolean;
  _version?: number;
};

const DEFAULT_TEAMS: TeamRecord[] = [
  { id: 1, code: "team_entry", label: "فريق الإدخال", orgId: 1, orgCode: "bank", roleCode: "rc_bank_intake", active: true, builtin: true },
  { id: 2, code: "team_internal", label: "فريق المراجعة الداخلية", orgId: 1, orgCode: "bank", roleCode: "rc_bank_reviewer", active: true, builtin: true },
  { id: 3, code: "team_fx", label: "فريق العمليات الخارجية", orgId: 1, orgCode: "bank", roleCode: "rc_bank_swift", active: true, builtin: true },
  { id: 4, code: "team_admin_bank", label: "فريق الإدارة (البنك)", orgId: 1, orgCode: "bank", roleCode: "rc_bank_admin", active: true, builtin: true },
  { id: 5, code: "team_support", label: "فريق اللجنة المساندة", orgId: 2, orgCode: "committee", roleCode: "rc_support_member", active: true, builtin: true },
  { id: 6, code: "team_exec", label: "فريق اللجنة التنفيذية", orgId: 2, orgCode: "committee", roleCode: "rc_executive_member", active: true, builtin: true },
  { id: 7, code: "team_fx_confirm", label: "فريق تأكيد العمليات", orgId: 2, orgCode: "committee", roleCode: "rc_committee_manager", active: true, builtin: true },
  { id: 8, code: "team_platform_admin", label: "إدارة النظام", orgId: 3, orgCode: "platform", roleCode: "rc_platform_admin", active: true, builtin: true },
];
```

Update sync helpers:

```ts
export function getTeam(code: string | undefined | null): TeamRecord | undefined {
  if (!code) return undefined;
  return teamsCell.get().find((t) => t.code === code);
}

export function getTeamLabel(code: string | undefined | null): string {
  return getTeam(code)?.label ?? "—";
}

export function getTeamRole(code: string | undefined | null): RoleId | undefined {
  return getTeam(code)?.roleCode;
}

export function activeTeamsByKind(orgCode: string): TeamRecord[] {
  return teamsCell.get().filter((t) => t.active && t.orgCode === orgCode);
}
```

- [ ] **Step 3: Evolve RoleCatalogEntry type and seed data**

```ts
export type RoleCatalogEntry = {
  id: number;
  code: string;
  name: string;
  orgId: number;
  orgCode: string;
  active: boolean;
  builtin: boolean;
  _version?: number;
};

const DEFAULT_ROLE_CATALOG: RoleCatalogEntry[] = [
  { id: 1, code: "rc_platform_admin", name: getRoleLabel("rc_platform_admin"), orgId: 3, orgCode: "platform", active: true, builtin: true },
  { id: 2, code: "rc_bank_admin", name: getRoleLabel("rc_bank_admin"), orgId: 1, orgCode: "bank", active: true, builtin: true },
  { id: 3, code: "rc_bank_intake", name: getRoleLabel("rc_bank_intake"), orgId: 1, orgCode: "bank", active: true, builtin: true },
  { id: 4, code: "rc_bank_reviewer", name: getRoleLabel("rc_bank_reviewer"), orgId: 1, orgCode: "bank", active: true, builtin: true },
  { id: 5, code: "rc_bank_swift", name: getRoleLabel("rc_bank_swift"), orgId: 1, orgCode: "bank", active: true, builtin: true },
  { id: 6, code: "rc_support_member", name: getRoleLabel("rc_support_member"), orgId: 2, orgCode: "committee", active: true, builtin: true },
  { id: 7, code: "rc_executive_member", name: getRoleLabel("rc_executive_member"), orgId: 2, orgCode: "committee", active: true, builtin: true },
  { id: 8, code: "rc_committee_manager", name: getRoleLabel("rc_committee_manager"), orgId: 2, orgCode: "committee", active: true, builtin: true },
];
```

Update sync helpers — use `code` as lookup key:

```ts
export function getRoleCatalog(code: string | undefined | null): RoleCatalogEntry | undefined {
  if (!code) return undefined;
  return roleCatalogCell.get().find((r) => r.code === code);
}

export function activeRolesByOrg(orgCode: string): RoleCatalogEntry[] {
  return roleCatalogCell.get().filter((r) => r.active && r.orgCode === orgCode);
}
```

- [ ] **Step 4: Update cell deserialization guards**

The existing guards that normalize old shapes need to detect old stored data (string IDs) and discard it, similar to `loadStoredUsers()`. For each cell, add a shape check that resets to defaults if old data is detected:

```ts
// After orgsCell declaration:
if (orgsCell.get().length > 0 && typeof orgsCell.get()[0].id === "string") {
  orgsCell.set(DEFAULT_ORGS);
}

// After teamsCell:
if (teamsCell.get().length > 0 && typeof teamsCell.get()[0].id === "string") {
  teamsCell.set(DEFAULT_TEAMS);
}

// After roleCatalogCell:
if (roleCatalogCell.get().length > 0 && typeof roleCatalogCell.get()[0].id === "string") {
  roleCatalogCell.set(DEFAULT_ROLE_CATALOG);
}
```

Remove the existing `roleCatalogCell` normalization guard (the one checking for extra keys) and the `rolePermsCell` normalization guard — they become unnecessary with the shape reset.

- [ ] **Step 5: Fix all consuming files for governance type changes**

Key patterns to update across admin screens:

| Old | New |
|---|---|
| `org.id === "bank"` | `org.code === "bank"` |
| `t.orgKind === o.id` | `t.orgCode === o.code` |
| `t.orgKind` | `t.orgCode` |
| `role.orgId` (was string) | `role.orgCode` (for string lookups) or `role.orgId` (for numeric) |
| `DEMO_USERS.filter(u => u.orgKind === o.id)` | `DEMO_USERS.filter(u => u.organization?.code === o.code)` |

- [ ] **Step 6: Run build gates**

```bash
bunx prettier --write src/lib/governance.ts
bunx tsc --noEmit
bunx vitest run
bunx eslint .
bunx vite build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: evolve governance types (OrgRecord/TeamRecord/RoleCatalogEntry) to backend shape"
```

---

### Task 4: Organizations adapter + screen rewire

**Files:**
- Create: `src/lib/data/organizations.ts`
- Create: `src/lib/data/organizations.test.ts`
- Modify: `src/routes/admin.orgs.tsx`

**Interfaces:**
- Consumes: `OrgRecord` from `governance.ts`, `api` from `http.ts`, `source` from `source.ts`, `ReadResult`/`MutationHandle`/`mockRead` from `query.ts`, `orgsCell`/`logAudit` from `governance.ts`
- Produces: `organizationKeys` factory
- Produces: `useOrganizations(): ReadResult<OrgRecord[]>`
- Produces: `useOrgMutations(): { createOrg: MutationHandle<{label,category},{...}>, updateOrg: MutationHandle<{id,label?,category?}>, toggleOrg: MutationHandle<{id,active}>, deleteOrg: MutationHandle<{id}> }`
- Produces: `toOrgRecord(dto): OrgRecord` mapper

Follow the exact pattern from `reference-data.ts`:
- DTO interface matching `OrganizationResource` shape
- `toOrgRecord(dto)` mapper
- `useOrganizations()` with mock/live branch, cell hydration on live
- `useOrgMutations()` with `handle()` helper, mock writes cell synchronously
- Status toggle uses `PATCH /organizations/{id} { is_active: false/true }` (WAF workaround)
- `organizationKeys` factory: `all`, `lists()`, `list(filters?)`, `details()`, `detail(id)`

Screen rewire pattern: same as reference-data.
- Replace `orgsCell.use()` → `useOrganizations()` data
- Replace `orgsCell.set()` mutations → `useOrgMutations()` calls with try/catch + toast
- Add loading guard with `Loader2`
- Remove direct `orgsCell` import (keep via governance for sync helpers if needed elsewhere)
- Wrap mutations in `try { await mutate(...); toast.success(...) } catch (e) { toast.error(isDomainError(e) ? e.message : "...") }`

Test: mapper test + key factory test (same pattern as reference-data.test.ts).

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement adapter**
- [ ] **Step 3: Rewire admin.orgs.tsx**
- [ ] **Step 4: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire organizations adapter + rewire admin screen"
```

---

### Task 5: Teams adapter + screen rewire

Same pattern as Task 4, for teams.

**Files:**
- Create: `src/lib/data/teams.ts`
- Create: `src/lib/data/teams.test.ts`
- Modify: `src/routes/admin.teams.tsx`

**Interfaces:**
- Produces: `teamKeys` factory
- Produces: `useTeams(): ReadResult<TeamRecord[]>`
- Produces: `useTeamMutations(): { createTeam, updateTeam, toggleTeam, deleteTeam }`
- Produces: `toTeamRecord(dto): TeamRecord` mapper

DTO matches `TeamResource`: `{id, version, code, name, organization: {id,code,name}, organization_id, is_system, is_active, ...}`.

Mapper: `organization.code` → `orgCode`, `organization_id` → `orgId`. `roleCode` set to `undefined` in live mode (backend has no role_code field — BH-03).

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement adapter**
- [ ] **Step 3: Rewire admin.teams.tsx**
- [ ] **Step 4: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire teams adapter + rewire admin screen"
```

---

### Task 6: Roles adapter + screen rewire

Same pattern.

**Files:**
- Create: `src/lib/data/roles.ts`
- Create: `src/lib/data/roles.test.ts`
- Modify: `src/routes/admin.roles.tsx`

**Interfaces:**
- Produces: `roleKeys` factory
- Produces: `useRoles(): ReadResult<RoleCatalogEntry[]>`
- Produces: `useRoleMutations(): { createRole, updateRole, toggleRole, deleteRole }`
- Produces: `toRoleCatalogEntry(dto): RoleCatalogEntry` mapper

DTO matches `RoleResource`: `{id, version, code, name, organization: {id,code,name}, organization_id, is_system, is_active, ...}`.

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement adapter**
- [ ] **Step 3: Rewire admin.roles.tsx**
- [ ] **Step 4: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire roles adapter + rewire admin screen"
```

---

### Task 7: Banks adapter + screen rewire

**Files:**
- Create: `src/lib/data/banks.ts`
- Create: `src/lib/data/banks.test.ts`
- Modify: `src/lib/mock.ts` — evolve `Entity` → import from banks adapter
- Modify: `src/lib/governance.ts` — `entitiesCell` type update
- Modify: `src/routes/admin.entities.tsx`

**Interfaces:**
- Produces: `BankEntity` type: `{id: number, code: string, name: string, licenseNumber?: string, swiftCode?: string, status: "active"|"inactive"|"suspended", _version?: number}`
- Produces: `bankKeys` factory
- Produces: `useBanks(): ReadResult<BankEntity[]>`
- Produces: `useBankMutations(): { createBank, updateBank, toggleBank, deleteBank }`
- Produces: `toBankEntity(dto): BankEntity` mapper

DTO matches `BankResource`: `{id, name, code, license_number, swift_code, status, version, ...}`.

The existing `Entity` type in `mock.ts` is different (has `active: boolean`). Either:
- Keep `Entity` and map `BankEntity` → `Entity` in the adapter for cell hydration, OR
- Evolve `entitiesCell` to use `BankEntity` and update the ~3 files that read `Entity`

Decision: Evolve `entitiesCell` to `BankEntity` type. This keeps the domain clean. The `Entity` type in mock.ts gets replaced.

The `ENTITIES` constant in mock.ts needs to become `BankEntity[]`.

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement adapter + evolve Entity type**
- [ ] **Step 3: Rewire admin.entities.tsx**
- [ ] **Step 4: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire banks adapter + evolve Entity type + rewire admin screen"
```

---

### Task 8: Users adapter + screens rewire

The most complex task — two screens (`admin.cby-staff.tsx` and `bank.users.tsx`) both manage users via `DEMO_USERS` array mutations.

**Files:**
- Create: `src/lib/data/users.ts`
- Create: `src/lib/data/users.test.ts`
- Modify: `src/routes/admin.cby-staff.tsx`
- Modify: `src/routes/bank.users.tsx`

**Interfaces:**
- Produces: `userKeys` factory
- Produces: `useUsers(filters?: {bankId?: number, roleCode?: string, search?: string}): ReadResult<User[]>`
- Produces: `useUserMutations(): { createUser: MutationHandle<CreateUserInput, User>, updateUser: MutationHandle<UpdateUserInput, User>, toggleUser: MutationHandle<{id: number, active: boolean}> }`

Live mode: `GET /users` → map DTO list, `POST /users`, `PATCH /users/{id}`, `POST /users/{id}/activate|deactivate` (PATCH workaround if WAF-blocked).

Mock mode: wraps `DEMO_USERS` array — push, splice, update. Calls `saveUsers()` + `upsertWorkflowUser()` + `logAudit()` like current screens do.

The mock mutations need to replicate exactly what the screens currently do (push + saveUsers + upsertWorkflowUser + logAudit). Move this logic into the mock adapter so screens just call `createUser.mutate(input)`.

Rewire both screens:
- `admin.cby-staff.tsx`: replace `DEMO_USERS` manipulation with `useUsers()` + `useUserMutations()`. Read orgs/teams/roles/banks from their respective adapter hooks (or governance cells for now — adapters may not be ready yet).
- `bank.users.tsx`: same, with `bankId` filter.

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement adapter**
- [ ] **Step 3: Rewire admin.cby-staff.tsx**
- [ ] **Step 4: Rewire bank.users.tsx**
- [ ] **Step 5: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire users adapter + rewire admin and bank user screens"
```

---

### Task 9: Screen permissions adapter + screen rewire

**Files:**
- Create: `src/lib/data/screen-permissions.ts`
- Modify: `src/routes/admin.screen-permissions.tsx`
- Modify: `src/components/workflow/ScreenGuard.tsx` — read permissions from user in live mode

**Interfaces:**
- Produces: `screenPermKeys` factory
- Produces: `usePermissionMatrix(): ReadResult<PermissionMatrixData>` where `PermissionMatrixData = { roles: {id,code,name}[], screens: {id,code,name}[], permissions: Record<string, Record<string, string[]>> }`
- Produces: `usePermissionMutations(): { togglePermission: MutationHandle<{roleId:number, screenCode:string, capability:string, enabled:boolean}> }`

Live: `GET /admin/role-permissions` for the matrix, `POST /admin/role-permissions/toggle` for toggles.

Mock: reads `screenPermsCell` + `roleCatalogCell`, writes via `setScreenPermission()`.

ScreenGuard update: In live mode, `canScreen()` should check `user.screenPermissions` array (from the `User` type, populated at login). In mock mode, keep reading from `screenPermsCell`.

- [ ] **Step 1: Implement adapter**
- [ ] **Step 2: Update ScreenGuard for live mode**
- [ ] **Step 3: Rewire admin.screen-permissions.tsx**
- [ ] **Step 4: Run build gates, format, commit**

```bash
git commit -m "feat(data): wire screen-permissions adapter + rewire admin screen + ScreenGuard"
```

---

### Task 10: Backend handoff docs update

**Files:**
- Modify: `docs/backend-handoff/BACKEND-HANDOFF.md` — BH-03, BH-04

- [ ] **Step 1: Add BH-03 and BH-04**

```
| BH-03 | teams | missing field | `TeamResource` has no `role_code` field. Frontend mock data assumes a 1:1 team→role mapping (`roleCode` on `TeamRecord`). In live mode this field is `undefined`. If team→role mapping is needed for user assignment forms, backend should add `role_code` to `TeamResource` or expose a team-role mapping endpoint. | `backend/app/Http/Resources/TeamResource.php` — no role field in toArray(). |
| BH-04 | users | missing field | `UserResource` has no `phone` field. Profile screen shows phone number from mock data. If phone display is needed, backend should add `phone` to the `UserResource` toArray. | `backend/app/Http/Resources/UserResource.php` — phone not included. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/backend-handoff/BACKEND-HANDOFF.md
git commit -m "docs(handoff): add BH-03 (team role_code) and BH-04 (user phone)"
```
