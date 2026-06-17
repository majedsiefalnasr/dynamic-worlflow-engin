import {
  canExecute,
  canView,
  getInitialStage,
  getPublishedVersion,
  getStagesForVersion,
  isAssigned,
  wfStore,
  ORG_ID_ALIASES,
  ROLE_ID_ALIASES,
  type WfUser,
  type WorkflowInstance,
  type WorkflowStage,
} from "@/lib/workflow-engine";
import { wfAuth } from "@/lib/workflow-engine/wfAuth";
import { manualScreenCan, type ScreenCapability, type ScreenKey } from "@/lib/governance";
import type { Role, User } from "@/lib/mock";

// Built-in demo identities keep their richly-seeded engine users (e.g. the
// exec lead also carries the member role). Everyone else gets a synthesized
// engine identity derived from their org/team/role selection.
const LEGACY_TO_WF_USER: Record<string, string> = {
  u1: "wu_admin",
  u2: "wu_support",
  u4: "wu_reviewer",
  u5: "wu_entry",
  u6: "wu_reviewer",
  u7: "wu_fx",
  u9: "wu_exec_lead",
  u10: "wu_exec_member",
  u11: "wu_exec_member",
  u12: "wu_exec_member",
  u13: "wu_exec_member",
  u14: "wu_exec_member",
};

const LEGACY_ROLE_TO_ENGINE_ROLE: Record<Role, string> = {
  platform_admin: "role_admin",
  bank_admin: "role_reviewer",
  bank_intake: "role_entry",
  bank_reviewer: "role_reviewer",
  bank_swift: "role_fx",
  support_member: "role_support",
  executive_member: "role_exec_member",
  committee_manager: "role_exec_lead",
};

/**
 * Builds an engine identity (WfUser) from a legacy user's org/team/role so the
 * permission engine recognizes users created in "مستخدمي النظام" — using the
 * same id aliasing the designer applies when saving assignments.
 */
export function wfUserFromLegacy(user: User | null | undefined): WfUser | null {
  if (!user) return null;
  const orgRaw = user.orgKind ?? (user.role === "platform_admin" ? "committee" : "bank");
  const organizationId = ORG_ID_ALIASES[orgRaw] ?? orgRaw;
  const roleEngine = user.roleId
    ? ROLE_ID_ALIASES[user.roleId] ?? user.roleId
    : LEGACY_ROLE_TO_ENGINE_ROLE[user.role];
  return {
    id: `wfu_${user.id}`,
    fullName: user.name,
    email: user.email,
    organizationId,
    teamIds: user.teamId ? [user.teamId] : [],
    roleIds: [roleEngine],
  };
}

/** Resolves the engine WfUser for a legacy user (built-in map or synthesized). */
export function getLegacyWorkflowUser(user: User | null | undefined): WfUser | null {
  if (!user) return null;
  const builtin = LEGACY_TO_WF_USER[user.id];
  if (builtin) return wfStore.users.get().find((u) => u.id === builtin) ?? null;
  return wfUserFromLegacy(user);
}

/**
 * Persists a synthesized engine user so it is available to the designer
 * (assignments user picker) and to permission checks before/after reload.
 * Built-in demo users already exist in the seed and are left untouched.
 */
export function upsertWfUserForLegacy(user: User | null | undefined) {
  if (!user || LEGACY_TO_WF_USER[user.id]) return;
  const wfUser = wfUserFromLegacy(user);
  if (!wfUser) return;
  wfStore.users.update((arr) => {
    const idx = arr.findIndex((u) => u.id === wfUser.id);
    if (idx < 0) return [...arr, wfUser];
    return arr.map((u) => (u.id === wfUser.id ? wfUser : u));
  });
}

export function syncWfUserFromLegacy(user: User | null | undefined) {
  if (!user) return wfAuth.setId(null);
  const builtin = LEGACY_TO_WF_USER[user.id];
  if (builtin) return wfAuth.setId(builtin);
  upsertWfUserForLegacy(user);
  wfAuth.setId(`wfu_${user.id}`);
}

export function visibleInstancesFor(user: User | null | undefined, instances = wfStore.instances.get()) {
  if (!user) return [];
  if (user.role === "platform_admin") return instances;

  const wfUser = getLegacyWorkflowUser(user);
  return instances.filter((inst) => canView(inst.currentStageId, wfUser));
}

export function stageFor(instance: WorkflowInstance): WorkflowStage | undefined {
  return wfStore.stages.get().find((s) => s.id === instance.currentStageId);
}

export function stageLabel(instance: WorkflowInstance): string {
  return stageFor(instance)?.name ?? "—";
}

export function instanceRef(instance: WorkflowInstance): string {
  const invoice = stringValue(instance.data.invoiceNumber);
  return invoice || instance.id.slice(-8).toUpperCase();
}

export function instanceTitle(instance: WorkflowInstance): string {
  return stringValue(instance.data.importerName) || "طلب";
}

export function instanceAmount(instance: WorkflowInstance): number {
  const amount = instance.data.financeAmount;
  return typeof amount === "number" ? amount : Number(amount) || 0;
}

export function instanceCurrency(instance: WorkflowInstance): string {
  return stringValue(instance.data.currency) || "USD";
}

export function instanceGoodsType(instance: WorkflowInstance): string {
  return stringValue(instance.data.importType) || "—";
}

export function progressForInstance(instance: WorkflowInstance): number {
  const stages = getStagesForVersion(instance.workflowVersionId).filter((s) => s.order < 99);
  const idx = stages.findIndex((s) => s.id === instance.currentStageId);
  if (idx < 0) return instance.status === "closed" ? 100 : 0;
  return Math.round(((idx + 1) / stages.length) * 100);
}

export function dashboardBuckets(instances: WorkflowInstance[]) {
  return {
    total: instances.length,
    active: instances.filter((i) => i.status === "active").length,
    closed: instances.filter((i) => i.status === "closed").length,
    rejected: instances.filter((i) => i.status === "rejected").length,
  };
}

// Representative workflow-engine user per legacy role. Roles share the same
// team/role assignments, so one representative user reflects the role's access.
const ROLE_TO_WF_USER: Record<Role, string> = {
  platform_admin: "wu_admin",
  bank_admin: "wu_reviewer",
  bank_intake: "wu_entry",
  bank_reviewer: "wu_reviewer",
  bank_swift: "wu_fx",
  support_member: "wu_support",
  executive_member: "wu_exec_member",
  committee_manager: "wu_exec_lead",
};

function wfUserForRole(role: Role): WfUser | null {
  return wfStore.users.get().find((u) => u.id === ROLE_TO_WF_USER[role]) ?? null;
}

export type RequestsAccess = { view: boolean; add: boolean; edit: boolean };

// Requests-screen access is mandated by the workflow designer:
// - assigned to execute the initial stage  → can create (add)
// - assigned to execute any stage          → can act (edit)
// - assigned to (view or execute) any stage → can see the screen (view)
//
// The platform admin always sees the requests screen and every request, but —
// like everyone else — can only create or act when the designer assigns them.
// Shared computation: derive requests access from a concrete engine identity.
function accessForWfUser(wfUser: WfUser | null, isAdmin: boolean): RequestsAccess {
  if (!wfUser) return { view: isAdmin, add: false, edit: false };

  const def = wfStore.definitions.get()[0];
  const version = def ? getPublishedVersion(def.id) : undefined;
  if (!version) return { view: isAdmin, add: false, edit: false };

  const stages = getStagesForVersion(version.id);
  const initial = getInitialStage(version.id);

  let view = isAdmin;
  let edit = false;
  for (const stage of stages) {
    if (isAssigned(stage.id, wfUser)) view = true;
    if (canExecute(stage.id, wfUser)) {
      edit = true;
      view = true;
    }
  }
  const add = Boolean(initial && canExecute(initial.id, wfUser));
  return { view, add, edit };
}

// Role-based view, used by the screen-permissions matrix (one row per role).
export function requestsAccessForRole(role: Role): RequestsAccess {
  return accessForWfUser(wfUserForRole(role), role === "platform_admin");
}

// User-based view: reflects the user's actual org/team/role assignment, so
// users created in "مستخدمي النظام" get exactly the access the designer grants.
export function requestsAccessForUser(user: User | null | undefined): RequestsAccess {
  return accessForWfUser(getLegacyWorkflowUser(user), user?.role === "platform_admin");
}

// Unified screen-permission gate. `requests` is derived from the designer
// using the user's real identity; other screens fall back to the role matrix.
export function canScreen(user: User | null | undefined, screen: ScreenKey, cap: ScreenCapability = "view"): boolean {
  if (screen === "requests") return requestsAccessForUser(user)[cap];
  return user ? manualScreenCan(user.role, screen, cap) : false;
}

export function roleCanCreateRequest(user: User | null | undefined): boolean {
  return canScreen(user, "requests", "add");
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
