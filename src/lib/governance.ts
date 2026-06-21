import { cell, dbResetAll } from "./db";
import {
  AUDIT as SEED_AUDIT,
  DEMO_USERS,
  ENTITIES,
  MERCHANTS as SEED_MERCHANTS,
  NOTIFICATIONS as SEED_NOTIFS,
  normalizeRoleId,
  ROLE_LABELS,
  type RoleId,
} from "./mock";

// ============================================================
// Persistent shared administration data.
// Request lifecycle state lives exclusively in `workflow-engine`.
// ============================================================

export type AuditEntry = {
  id: string;
  userId: string;
  userName: string;
  role: RoleId;
  action: string;
  ts: string;
  ip: string;
  device: string;
  ref: string;
  fromStage?: string;
  toStage?: string;
  notes?: string;
};

export const auditCell = cell<AuditEntry[]>(
  "audit",
  SEED_AUDIT.map((a) => ({
    id: a.id,
    userId: DEMO_USERS[0].id,
    userName: a.user,
    role: "rc_platform_admin",
    action: a.action,
    ts: a.ts,
    ip: a.ip,
    device: a.device,
    ref: a.ref,
  })),
);

export function logAudit(entry: Omit<AuditEntry, "id" | "ts" | "ip" | "device">) {
  auditCell.set((prev) => [
    {
      ...entry,
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(),
      ip: "127.0.0.1",
      device: typeof navigator !== "undefined" ? navigator.userAgent.split(") ")[0].slice(0, 40) : "server",
    },
    ...prev,
  ]);
}

export type Notif = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  audience?: "all" | RoleId | "cby";
  href?: string;
};

export const notificationsCell = cell<Notif[]>(
  "notifications",
  SEED_NOTIFS.map((n) => ({ ...n, audience: "all" as const })),
);

export function notify(n: Omit<Notif, "id" | "time" | "unread">) {
  notificationsCell.set((prev) => [
    { ...n, id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, time: "الآن", unread: true },
    ...prev,
  ]);
}

export function markAllRead() {
  notificationsCell.set((prev) => prev.map((n) => ({ ...n, unread: false })));
}

export function markNotifRead(id: string, unread = false) {
  notificationsCell.set((prev) => prev.map((n) => (n.id === id ? { ...n, unread } : n)));
}

export function deleteNotif(id: string) {
  notificationsCell.set((prev) => prev.filter((n) => n.id !== id));
}

export function clearAllNotifs() {
  notificationsCell.set(() => []);
}

export const merchantsCell = cell("merchants", SEED_MERCHANTS);
export const entitiesCell = cell("entities", ENTITIES);

// ============================================================
// Internal reference tables
// ============================================================

export type ReferenceValue = {
  id: string;
  key: string;
  label: string;
};

export type ReferenceTable = {
  id: string;
  key: string;
  label: string;
  system?: boolean;
  values: ReferenceValue[];
};

const DEFAULT_REFERENCE_TABLES: ReferenceTable[] = [
  {
    id: "rt_sector_activity",
    key: "sector_activity",
    label: "القطاع/النشاط",
    system: true,
    values: [
      { id: "rv_food", key: "food", label: "مواد غذائية" },
      { id: "rv_medical", key: "medical_supplies", label: "أدوية ومستلزمات طبية" },
      { id: "rv_petroleum", key: "petroleum_derivatives", label: "مشتقات نفطية" },
      { id: "rv_spare_parts", key: "spare_parts", label: "قطع غيار" },
      { id: "rv_construction", key: "construction_materials", label: "مواد بناء" },
      { id: "rv_electronics", key: "electronics", label: "إلكترونيات" },
    ],
  },
  {
    id: "rt_arrival_port",
    key: "arrival_port",
    label: "ميناء الوصول",
    system: true,
    values: [
      { id: "rv_aden_port", key: "aden_port", label: "ميناء عدن" },
      { id: "rv_hodeidah_port", key: "hodeidah_port", label: "ميناء الحديدة" },
      { id: "rv_mukalla_port", key: "mukalla_port", label: "ميناء المكلا" },
      { id: "rv_wadea_crossing", key: "wadea_crossing", label: "منفذ الوديعة" },
    ],
  },
  {
    id: "rt_origin_country",
    key: "origin_country",
    label: "بلد المنشأ",
    system: true,
    values: [
      { id: "rv_usa", key: "usa", label: "الولايات المتحدة" },
      { id: "rv_germany", key: "germany", label: "ألمانيا" },
      { id: "rv_china", key: "china", label: "الصين" },
      { id: "rv_saudi_arabia", key: "saudi_arabia", label: "السعودية" },
      { id: "rv_uae", key: "uae", label: "الإمارات" },
      { id: "rv_india", key: "india", label: "الهند" },
      { id: "rv_egypt", key: "egypt", label: "مصر" },
    ],
  },
];

export const referenceTablesCell = cell<ReferenceTable[]>("referenceTables", DEFAULT_REFERENCE_TABLES);

export function referenceValues(tableKey: string): ReferenceValue[] {
  return referenceTablesCell.get().find((t) => t.key === tableKey)?.values ?? [];
}

export function referenceLabels(tableKey: string): string[] {
  return referenceValues(tableKey).map((v) => v.label);
}

export type OrgCategory = "bank" | "committee" | "other";

export type OrgRecord = {
  id: string;
  label: string;
  active: boolean;
  builtin?: boolean;
  category?: OrgCategory;
  /** Legacy value kept for stored records created before categories existed. */
  isBank?: boolean;
};

const DEFAULT_ORGS: OrgRecord[] = [
  { id: "bank", label: "البنوك التجارية", active: true, builtin: true, category: "bank" },
  { id: "committee", label: "اللجنة الوطنية لتمويل الواردات", active: true, builtin: true, category: "committee" },
  { id: "platform", label: "إدارة النظام", active: true, builtin: true, category: "other" },
];

export const orgsCell = cell<OrgRecord[]>("orgs", DEFAULT_ORGS);

export function getOrgCategory(org: OrgRecord | string | null | undefined): OrgCategory {
  const record = typeof org === "string" ? orgsCell.get().find((item) => item.id === org) : org;
  if (!record) return "other";
  if (record.category) return record.category;
  if (record.isBank || record.id === "bank") return "bank";
  if (record.id === "committee") return "committee";
  return "other";
}

export function getOrgLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return orgsCell.get().find((o) => o.id === id)?.label ?? id;
}

export function activeOrgs(): OrgRecord[] {
  return orgsCell.get().filter((o) => o.active);
}

export type TeamOrgKind = string;
export type TeamRecord = {
  id: string;
  label: string;
  orgKind: TeamOrgKind;
  roleCode: RoleId;
  active: boolean;
  builtin?: boolean;
};

const DEFAULT_TEAMS: TeamRecord[] = [
  { id: "team_entry", label: "فريق الإدخال", orgKind: "bank", roleCode: "rc_bank_intake", active: true, builtin: true },
  { id: "team_internal", label: "فريق المراجعة الداخلية", orgKind: "bank", roleCode: "rc_bank_reviewer", active: true, builtin: true },
  { id: "team_fx", label: "فريق العمليات الخارجية", orgKind: "bank", roleCode: "rc_bank_swift", active: true, builtin: true },
  { id: "team_admin_bank", label: "فريق الإدارة (البنك)", orgKind: "bank", roleCode: "rc_bank_admin", active: true, builtin: true },
  { id: "team_support", label: "فريق اللجنة المساندة", orgKind: "committee", roleCode: "rc_support_member", active: true, builtin: true },
  { id: "team_exec", label: "فريق اللجنة التنفيذية", orgKind: "committee", roleCode: "rc_executive_member", active: true, builtin: true },
  { id: "team_fx_confirm", label: "فريق تأكيد العمليات", orgKind: "committee", roleCode: "rc_committee_manager", active: true, builtin: true },
  { id: "team_platform_admin", label: "إدارة النظام", orgKind: "platform", roleCode: "rc_platform_admin", active: true, builtin: true },
];

export const teamsCell = cell<TeamRecord[]>("teams", DEFAULT_TEAMS);

export function getTeam(id: string | undefined | null): TeamRecord | undefined {
  if (!id) return undefined;
  return teamsCell.get().find((t) => t.id === id);
}

export function getTeamLabel(id: string | undefined | null): string {
  return getTeam(id)?.label ?? "—";
}

export function getTeamRole(id: string | undefined | null): RoleId | undefined {
  return getTeam(id)?.roleCode;
}

export function activeTeamsByKind(kind: TeamOrgKind): TeamRecord[] {
  return teamsCell.get().filter((t) => t.active && t.orgKind === kind);
}

export type RoleCatalogEntry = {
  id: string;
  name: string;
  orgId: string;
  active: boolean;
  builtin?: boolean;
};

const DEFAULT_ROLE_CATALOG: RoleCatalogEntry[] = [
  { id: "rc_platform_admin", name: ROLE_LABELS.rc_platform_admin, orgId: "platform", active: true, builtin: true },
  { id: "rc_bank_admin", name: ROLE_LABELS.rc_bank_admin, orgId: "bank", active: true, builtin: true },
  { id: "rc_bank_intake", name: ROLE_LABELS.rc_bank_intake, orgId: "bank", active: true, builtin: true },
  { id: "rc_bank_reviewer", name: ROLE_LABELS.rc_bank_reviewer, orgId: "bank", active: true, builtin: true },
  { id: "rc_bank_swift", name: ROLE_LABELS.rc_bank_swift, orgId: "bank", active: true, builtin: true },
  { id: "rc_support_member", name: ROLE_LABELS.rc_support_member, orgId: "committee", active: true, builtin: true },
  { id: "rc_executive_member", name: ROLE_LABELS.rc_executive_member, orgId: "committee", active: true, builtin: true },
  { id: "rc_committee_manager", name: ROLE_LABELS.rc_committee_manager, orgId: "committee", active: true, builtin: true },
];

export const roleCatalogCell = cell<RoleCatalogEntry[]>("roleCatalog", DEFAULT_ROLE_CATALOG);

// Normalize previously persisted records to the current role schema.
if (roleCatalogCell.get().some((role) => Object.keys(role).some((key) => !["id", "name", "orgId", "active", "builtin"].includes(key)))) {
  roleCatalogCell.set((roles) =>
    roles.map(({ id, name, orgId, active, builtin }) => ({ id, name, orgId, active, builtin })),
  );
}

export function activeRolesByOrg(orgId: string): RoleCatalogEntry[] {
  return roleCatalogCell.get().filter((r) => r.active && r.orgId === orgId);
}

export function getRoleCatalog(id: string | undefined | null): RoleCatalogEntry | undefined {
  if (!id) return undefined;
  return roleCatalogCell.get().find((r) => r.id === id);
}

export type Permission =
  | "request.create" | "request.review" | "request.approve" | "request.reject"
  | "workflow.execute" | "reports.view" | "audit.view"
  | "merchants.manage" | "users.manage" | "entities.manage"
  | "roles.manage";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "request.create": "إنشاء طلب",
  "request.review": "مراجعة الطلبات",
  "request.approve": "اعتماد الطلبات",
  "request.reject": "رفض الطلبات",
  "workflow.execute": "تنفيذ إجراءات سير العمل",
  "reports.view": "عرض التقارير",
  "audit.view": "عرض سجل التدقيق",
  "merchants.manage": "إدارة التجار",
  "users.manage": "إدارة المستخدمين",
  "entities.manage": "إدارة البنوك والصرافات",
  "roles.manage": "إدارة الأدوار والصلاحيات",
};

const DEFAULT_ROLE_PERMS: Record<string, Permission[]> = {
  rc_platform_admin: ["reports.view", "audit.view", "merchants.manage", "users.manage", "entities.manage", "roles.manage"],
  rc_bank_admin: ["request.create", "workflow.execute", "reports.view", "audit.view", "merchants.manage", "users.manage", "roles.manage"],
  rc_bank_intake: ["request.create", "merchants.manage"],
  rc_bank_reviewer: ["workflow.execute"],
  rc_bank_swift: ["workflow.execute"],
  rc_support_member: ["workflow.execute", "audit.view"],
  rc_executive_member: ["workflow.execute", "reports.view", "audit.view"],
  rc_committee_manager: ["workflow.execute", "reports.view", "audit.view"],
};

export const rolePermsCell = cell<Record<string, Permission[]>>("rolePerms", DEFAULT_ROLE_PERMS);

if (Object.keys(rolePermsCell.get()).some((roleId) => !roleId.startsWith("rc_"))) {
  rolePermsCell.set((permissions) =>
    Object.fromEntries(Object.entries(permissions).map(([roleId, values]) => [normalizeRoleId(roleId), values])),
  );
}

export function can(roleId: RoleId, perm: Permission): boolean {
  return rolePermsCell.get()[roleId]?.includes(perm) ?? false;
}

export type SubRole = { id: string; entityId: string; name: string; permissions: Permission[] };
export const subRolesCell = cell<SubRole[]>("subRoles", []);

// ============================================================
// Screen visibility permissions
//
// `requests` is special: its view/add/edit access is DERIVED from the workflow
// designer (stage assignments) — see `requestsAccessForRole` in workflow-bridge.
// A role assigned to execute the initial stage can create requests, a role
// assigned to execute any stage can act on requests, and any assigned role can
// view them. So the designer mandates the requests-screen permissions.
//
// The remaining screens (reports/audit/merchants) are NOT part of the workflow,
// so their visibility is managed manually here as a role × screen matrix.
// The system admin (platform_admin) always has full access; management screens
// (designer, roles, ...) stay reserved for the admin.
// ============================================================

export type ScreenCapability = "view" | "add" | "edit";

export type ScreenKey = "requests" | "merchants" | "reports" | "audit";

/** Screens whose permissions are edited manually (i.e. not derived from the engine). */
export type ManualScreenKey = Exclude<ScreenKey, "requests">;

export type ScreenDef = {
  key: ManualScreenKey;
  label: string;
  to: string;
  description: string;
  caps: ScreenCapability[];
};

export const MANAGED_SCREENS: ScreenDef[] = [
  {
    key: "merchants",
    label: "إدارة التجار",
    to: "/merchants",
    description: "عرض شاشة التجار (إدارة بيانات التجار تتبع البنك المالك للتاجر).",
    caps: ["view", "add"],
  },
  {
    key: "reports",
    label: "التقارير والتحليلات",
    to: "/reports",
    description: "الاطّلاع على لوحات التقارير والإحصاءات.",
    caps: ["view"],
  },
  {
    key: "audit",
    label: "التدقيق والامتثال",
    to: "/audit",
    description: "الاطّلاع على سجل التدقيق والعمليات.",
    caps: ["view"],
  },
];

export const SCREEN_CAP_LABELS: Record<ScreenCapability, string> = {
  view: "عرض",
  add: "إضافة",
  edit: "تعديل",
};

export type ScreenPerms = Record<ManualScreenKey, Partial<Record<RoleId, ScreenCapability[]>>>;

const DEFAULT_SCREEN_PERMS: ScreenPerms = {
  merchants: {
    rc_bank_admin: ["view", "add"],
  },
  reports: {
    rc_bank_admin: ["view"],
    rc_support_member: ["view"],
    rc_executive_member: ["view"],
    rc_committee_manager: ["view"],
  },
  audit: {},
};

export const screenPermsCell = cell<ScreenPerms>("screenPerms", DEFAULT_SCREEN_PERMS);

if (
  Object.values(screenPermsCell.get()).some((permissions) =>
    Object.keys(permissions).some((roleId) => !roleId.startsWith("rc_")),
  )
) {
  screenPermsCell.set((screens) =>
    Object.fromEntries(
      Object.entries(screens).map(([screen, permissions]) => [
        screen,
        Object.fromEntries(
          Object.entries(permissions).map(([roleId, capabilities]) => [normalizeRoleId(roleId), capabilities]),
        ),
      ]),
    ) as ScreenPerms,
  );
}

/** Permission check for manually-managed screens (reports/audit/merchants). */
export function manualScreenCan(roleId: RoleId, screen: ManualScreenKey, cap: ScreenCapability = "view"): boolean {
  if (roleId === "rc_platform_admin") return true;
  return screenPermsCell.get()[screen]?.[roleId]?.includes(cap) ?? false;
}

export function setScreenPermission(screen: ManualScreenKey, roleId: RoleId, cap: ScreenCapability, enabled: boolean) {
  screenPermsCell.set((prev) => {
    const current = prev[screen]?.[roleId] ?? [];
    let next: ScreenCapability[];
    if (enabled) {
      next = current.includes(cap) ? current : [...current, cap];
      // granting add/edit implies view so the role can reach the screen.
      if (cap !== "view" && !next.includes("view")) next = ["view", ...next];
    } else {
      next = current.filter((c) => c !== cap);
      // removing view removes everything (cannot act without seeing the screen).
      if (cap === "view") next = [];
    }
    return { ...prev, [screen]: { ...prev[screen], [roleId]: next } };
  });
}

export function resetDemoData() {
  dbResetAll();
  if (typeof window !== "undefined") window.location.reload();
}
