import {
  canExecute,
  canView,
  canViewByStageRouting,
  getInitialStage,
  processLabelForStage,
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
import {
  manualScreenCan,
  roleCatalogCell,
  teamsCell,
  type ScreenCapability,
  type ScreenKey,
} from "@/lib/governance";
import type { RoleId, User } from "@/lib/mock";

// Built-in demo identities keep their richly-seeded engine users (e.g. the
// exec lead also carries the member role). Everyone else gets a synthesized
// engine identity derived from their org/team/role selection.
const BUILTIN_ACCOUNT_TO_WF_USER: Record<string, string> = {
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

/**
 * Builds an engine identity (WfUser) from an account's org/team/role so the
 * permission engine recognizes users created in "مستخدمي النظام" — using the
 * same id aliasing the designer applies when saving assignments.
 */
export function wfUserFromAccount(user: User | null | undefined): WfUser | null {
  if (!user) return null;
  const orgRaw = user.orgKind ?? "bank";
  const organizationId = ORG_ID_ALIASES[orgRaw] ?? orgRaw;
  const roleEngine = ROLE_ID_ALIASES[user.roleId] ?? user.roleId;
  return {
    id: `wfu_${user.id}`,
    fullName: user.name,
    email: user.email,
    organizationId,
    teamIds: user.teamId ? [user.teamId] : [],
    roleIds: [roleEngine],
  };
}

/** Resolves the engine WfUser for an account (built-in map or synthesized). */
export function getWorkflowUser(user: User | null | undefined): WfUser | null {
  if (!user) return null;
  const builtin = BUILTIN_ACCOUNT_TO_WF_USER[user.id];
  if (builtin) return wfStore.users.get().find((u) => u.id === builtin) ?? null;
  return wfUserFromAccount(user);
}

/**
 * Persists a synthesized engine user so it is available to the designer
 * (assignments user picker) and to permission checks before/after reload.
 * Built-in demo users already exist in the seed and are left untouched.
 */
export function upsertWorkflowUser(user: User | null | undefined) {
  if (!user || BUILTIN_ACCOUNT_TO_WF_USER[user.id]) return;
  const wfUser = wfUserFromAccount(user);
  if (!wfUser) return;
  wfStore.users.update((arr) => {
    const idx = arr.findIndex((u) => u.id === wfUser.id);
    if (idx < 0) return [...arr, wfUser];
    return arr.map((u) => (u.id === wfUser.id ? wfUser : u));
  });
}

export function syncWorkflowUser(user: User | null | undefined) {
  if (!user) return wfAuth.setId(null);
  const builtin = BUILTIN_ACCOUNT_TO_WF_USER[user.id];
  if (builtin) return wfAuth.setId(builtin);
  upsertWorkflowUser(user);
  wfAuth.setId(`wfu_${user.id}`);
}

export function visibleInstancesFor(user: User | null | undefined, instances = wfStore.instances.get()) {
  if (!user) return [];
  if (user.roleId === "rc_platform_admin") return instances;

  const wfUser = getWorkflowUser(user);
  return instances.filter((inst) => canViewByStageRouting(inst.currentStageId, wfUser));
}

export function stageFor(instance: WorkflowInstance): WorkflowStage | undefined {
  return wfStore.stages.get().find((s) => s.id === instance.currentStageId);
}

export function stageLabel(instance: WorkflowInstance): string {
  const stage = stageFor(instance);
  return stage ? processLabelForStage(stage, wfAuth.get()) : "—";
}

export function instanceRef(instance: WorkflowInstance): string {
  return stringValue(instance.data.requestIdentifier) || instance.id.slice(-8).toUpperCase();
}

export function instanceInvoiceNumber(instance: WorkflowInstance): string {
  return stringValue(instance.data.invoiceNumber) || "—";
}

export function instanceTitle(instance: WorkflowInstance): string {
  return stringValue(instance.data.importerName) || "طلب";
}

export function instanceAmount(instance: WorkflowInstance): number {
  const amount = instance.data.financeAmount;
  return typeof amount === "number" ? amount : Number(amount) || 0;
}

export function instanceCurrency(instance: WorkflowInstance): string {
  return stringValue(instance.data.currency) || "دولار أمريكي";
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

function wfUserForRole(roleId: RoleId): WfUser | null {
  const role = roleCatalogCell.get().find((item) => item.id === roleId);
  if (!role) return null;
  return {
    id: `role_preview_${roleId}`,
    fullName: role.name,
    email: `${roleId}@role.local`,
    organizationId: ORG_ID_ALIASES[role.orgId] ?? role.orgId,
    teamIds: teamsCell.get().filter((team) => team.roleCode === roleId).map((team) => team.id),
    roleIds: [ROLE_ID_ALIASES[roleId] ?? roleId],
  };
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
export function requestsAccessForRole(roleId: RoleId): RequestsAccess {
  return accessForWfUser(wfUserForRole(roleId), roleId === "rc_platform_admin");
}

// User-based view: reflects the user's actual org/team/role assignment, so
// users created in "مستخدمي النظام" get exactly the access the designer grants.
export function requestsAccessForUser(user: User | null | undefined): RequestsAccess {
  return accessForWfUser(getWorkflowUser(user), user?.roleId === "rc_platform_admin");
}

// Unified screen-permission gate. `requests` is derived from the designer
// using the user's real identity; other screens fall back to the role matrix.
export function canScreen(user: User | null | undefined, screen: ScreenKey, cap: ScreenCapability = "view"): boolean {
  if (screen === "requests") return requestsAccessForUser(user)[cap];
  return user ? manualScreenCan(user.roleId, screen, cap) : false;
}

export function roleCanCreateRequest(user: User | null | undefined): boolean {
  return canScreen(user, "requests", "add");
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function isDuplicateInvoice(
  data: Record<string, unknown>,
  excludeInstanceId?: string,
): { duplicate: boolean; refs: string[] } {
  const invoiceNumber = stringValue(data.invoiceNumber).trim();
  if (!invoiceNumber) {
    return { duplicate: false, refs: [] };
  }
  const instances = wfStore.instances.get();
  const currentInstance = instances.find((instance) => instance.id === excludeInstanceId);
  const matches = instances.filter((inst) => {
    if (inst.id === excludeInstanceId) return false;
    if (currentInstance && inst.createdAt >= currentInstance.createdAt) return false;
    return stringValue(inst.data.invoiceNumber).trim() === invoiceNumber;
  });
  return {
    duplicate: matches.length > 0,
    refs: matches.map((m) => instanceRef(m)),
  };
}
