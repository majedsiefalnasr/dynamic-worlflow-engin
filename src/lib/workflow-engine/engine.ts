import { store, uid } from "./storage";
import type {
  WorkflowInstance, WorkflowHistory, WorkflowTransition, StageAssignment,
  FieldRule, FieldDefinition, FieldGroup, StageGroup, StageGroupAudience, StageRoutingRule, WfUser, WorkflowStage, WorkflowVersion,
  WorkflowDefinition, WorkflowAction,
} from "./types";

// ------------------------------------------------------------
// Pure engine functions — never touch the DOM, never throw on
// missing data. Components call these for routing, permissions
// and field rules.
// ------------------------------------------------------------

export function getDefinitionByCode(code: string): WorkflowDefinition | undefined {
  return store.definitions.get().find((d) => d.code === code);
}

export function getPublishedVersion(workflowId: string): WorkflowVersion | undefined {
  const def = store.definitions.get().find((d) => d.id === workflowId);
  if (!def?.activeVersionId) {
    return store.versions.get().find((v) => v.workflowId === workflowId && v.isPublished);
  }
  return store.versions.get().find((v) => v.id === def.activeVersionId);
}

export function getStagesForVersion(versionId: string): WorkflowStage[] {
  return store.stages.get()
    .filter((s) => s.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
}

export function getInitialStage(versionId: string): WorkflowStage | undefined {
  const stages = getStagesForVersion(versionId);
  return stages.find((s) => s.isInitial) ?? stages[0];
}

export function getTransitionsFrom(stageId: string): WorkflowTransition[] {
  return store.transitions.get().filter((t) => t.fromStageId === stageId);
}

export function getAssignmentsFor(stageId: string): StageAssignment[] {
  return store.assignments.get().filter((a) => a.stageId === stageId);
}

/** Whether `user` matches at least one assignment row for `stageId`. */
export function canExecute(stageId: string, user: WfUser | null): boolean {
  if (!user) return false;
  const assigns = getAssignmentsFor(stageId).filter((a) => !a.viewOnly);
  if (assigns.length === 0) return false;
  return assigns.some((a) => matchAssignment(a, user));
}

export function canView(stageId: string, user: WfUser | null): boolean {
  if (!user) return false;
  const assigns = getAssignmentsFor(stageId);
  if (assigns.length === 0) return true;
  return assigns.some((a) => matchAssignment(a, user));
}

/** True if the user is explicitly assigned (view or execute) to the stage. */
export function isAssigned(stageId: string, user: WfUser | null): boolean {
  if (!user) return false;
  return getAssignmentsFor(stageId).some((a) => matchAssignment(a, user));
}

export const ORG_ID_ALIASES: Record<string, string> = {
  bank: "org_bank",
  committee: "org_committee",
  platform: "org_committee",
};

export const ROLE_ID_ALIASES: Record<string, string> = {
  rc_bank_admin: "role_reviewer",
  rc_bank_intake: "role_entry",
  rc_bank_reviewer: "role_reviewer",
  rc_bank_swift: "role_fx",
  rc_support_member: "role_support",
  rc_executive_member: "role_exec_member",
  rc_committee_manager: "role_exec_lead",
  rc_platform_admin: "role_admin",
};

function assignmentOrgMatches(organizationId: string | undefined, user: WfUser): boolean {
  if (!organizationId) return true;
  return user.organizationId === (ORG_ID_ALIASES[organizationId] ?? organizationId);
}

function assignmentRoleMatches(roleId: string | undefined, user: WfUser): boolean {
  if (!roleId) return true;
  return user.roleIds.includes(ROLE_ID_ALIASES[roleId] ?? roleId);
}

function matchAssignment(a: StageAssignment, user: WfUser): boolean {
  if (a.userId && a.userId !== user.id) return false;
  if (!assignmentOrgMatches(a.organizationId, user)) return false;
  if (a.teamId && !user.teamIds.includes(a.teamId)) return false;
  if (!assignmentRoleMatches(a.roleId, user)) return false;
  // assignment with no filters at all matches everyone
  return Boolean(a.userId || a.organizationId || a.teamId || a.roleId);
}

export function getAvailableActions(instance: WorkflowInstance, user: WfUser | null): WorkflowTransition[] {
  if (!user) return [];
  if (!canExecute(instance.currentStageId, user)) return [];
  return getTransitionsFrom(instance.currentStageId);
}

export function getFieldDefs(versionId: string): FieldDefinition[] {
  return store.fieldDefs.get().filter((f) => f.workflowVersionId === versionId);
}

export function getFieldGroups(versionId: string): FieldGroup[] {
  return store.fieldGroups.get()
    .filter((g) => g.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
}

export function getStageGroups(versionId: string): StageGroup[] {
  return store.stageGroups.get()
    .filter((g) => g.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
}

export function getStageRoutingRules(versionId: string): StageRoutingRule[] {
  return getEffectiveStageRoutingRules(versionId);
}

/**
 * Whether `user` matches a single audience rule. Each set field must match
 * (org/role ids are aliased to engine ids); unset fields mean "any".
 */
function audienceRuleMatches(rule: StageGroupAudience, user: WfUser): boolean {
  if (rule.organizationId && user.organizationId !== (ORG_ID_ALIASES[rule.organizationId] ?? rule.organizationId)) return false;
  if (rule.teamId && !user.teamIds.includes(rule.teamId)) return false;
  if (rule.roleId && !user.roleIds.includes(ROLE_ID_ALIASES[rule.roleId] ?? rule.roleId)) return false;
  return true;
}

export function stageRoutingRuleMatches(rule: Pick<StageRoutingRule, "organizationId" | "teamId" | "roleId">, user: WfUser): boolean {
  if (rule.organizationId && user.organizationId !== (ORG_ID_ALIASES[rule.organizationId] ?? rule.organizationId)) return false;
  if (rule.teamId && !user.teamIds.includes(rule.teamId)) return false;
  if (rule.roleId && !user.roleIds.includes(ROLE_ID_ALIASES[rule.roleId] ?? rule.roleId)) return false;
  return true;
}

export function getStageRoutingForUser(stage: WorkflowStage, user: WfUser | null): StageRoutingRule | undefined {
  const rules = getEffectiveStageRoutingRules(stage.workflowVersionId).filter((r) => r.stageId === stage.id);
  if (rules.length === 0 || !user) return undefined;
  return rules.find((r) => stageRoutingRuleMatches(r, user));
}

export function canViewByStageRouting(stageId: string, user: WfUser | null): boolean {
  if (!user) return false;
  if (user.roleIds.includes("role_admin")) return true;
  const stage = store.stages.get().find((s) => s.id === stageId);
  const rules = stage
    ? getEffectiveStageRoutingRules(stage.workflowVersionId).filter((r) => r.stageId === stageId)
    : store.stageRoutingRules.get().filter((r) => r.stageId === stageId);
  if (rules.length === 0) return canView(stageId, user);
  return rules.some((r) => stageRoutingRuleMatches(r, user));
}

export function processLabelForStage(stage: WorkflowStage, user: WfUser | null): string {
  return getStageRoutingForUser(stage, user)?.processLabel ?? stage.processLabel ?? stage.name;
}

export function isAssignmentBackedStageRoutingRule(ruleId: string): boolean {
  return ruleId.startsWith("sr_assignment_");
}

export function getAssignmentBackedStageRoutingRules(versionId: string): StageRoutingRule[] {
  const stages = store.stages.get().filter((s) => s.workflowVersionId === versionId);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const manualRules = store.stageRoutingRules.get().filter((r) => r.workflowVersionId === versionId);
  const manualByScope = new Map(manualRules.map((r) => [stageRoutingScopeKey(r), r]));
  const seen = new Set<string>();
  const rules: StageRoutingRule[] = [];

  for (const assignment of store.assignments.get()) {
    const stage = stageById.get(assignment.stageId);
    if (!stage) continue;

    const rule: StageRoutingRule = {
      id: `sr_assignment_${assignment.id}`,
      workflowVersionId: versionId,
      stageId: assignment.stageId,
      organizationId: assignment.organizationId,
      teamId: assignment.teamId,
      roleId: assignment.roleId,
      processLabel: stage.name,
    };

    if (!rule.organizationId && !rule.teamId && !rule.roleId) continue;

    const key = stageRoutingScopeKey(rule);
    if (seen.has(key)) continue;
    seen.add(key);

    rules.push({
      ...rule,
      processLabel: manualByScope.get(key)?.processLabel ?? rule.processLabel,
    });
  }

  return rules;
}

export function getEffectiveStageRoutingRules(versionId: string): StageRoutingRule[] {
  const mandatoryRules = getAssignmentBackedStageRoutingRules(versionId);
  const mandatoryScopes = new Set(mandatoryRules.map(stageRoutingScopeKey));
  const manualRules = store.stageRoutingRules
    .get()
    .filter((r) => r.workflowVersionId === versionId && !mandatoryScopes.has(stageRoutingScopeKey(r)));

  return [...mandatoryRules, ...manualRules];
}

function stageRoutingScopeKey(rule: Pick<StageRoutingRule, "stageId" | "organizationId" | "teamId" | "roleId">): string {
  return [
    rule.stageId,
    rule.organizationId ? ORG_ID_ALIASES[rule.organizationId] ?? rule.organizationId : "",
    rule.teamId ?? "",
    rule.roleId ? ROLE_ID_ALIASES[rule.roleId] ?? rule.roleId : "",
  ].join("|");
}

/**
 * Whether `user` is part of a stage group's audience. A group with no
 * audience rules is visible to everyone; otherwise the user must match at
 * least one rule.
 */
export function stageGroupVisibleTo(group: StageGroup, user: WfUser | null): boolean {
  const rules = group.audiences ?? [];
  if (rules.length === 0) return true;
  if (!user) return false;
  return rules.some((r) => audienceRuleMatches(r, user));
}

export function getFieldRules(stageId: string): FieldRule[] {
  return store.fieldRules.get().filter((r) => r.stageId === stageId);
}

/** Merge field defs with stage rules — fields with no rule default to visible+editable+optional. */
export function getStageFields(versionId: string, stageId: string) {
  const defs = getFieldDefs(versionId);
  const rules = getFieldRules(stageId);
  return defs.map((def) => {
    const rule = rules.find((r) => r.fieldKey === def.key);
    return {
      def,
      visible: rule?.visible ?? true,
      editable: rule?.editable ?? true,
      required: rule?.required ?? false,
      groupId: def.groupId,
    };
  });
}

// ------------------------------------------------------------
// Mutations
// ------------------------------------------------------------

export function createInstance(opts: {
  workflowVersionId: string;
  user: WfUser;
  data?: Record<string, unknown>;
}): WorkflowInstance {
  const initial = getInitialStage(opts.workflowVersionId);
  if (!initial) throw new Error("Workflow version has no stages");
  const now = new Date().toISOString();
  const inst: WorkflowInstance = {
    id: uid("inst"),
    workflowVersionId: opts.workflowVersionId,
    currentStageId: initial.id,
    status: "active",
    data: opts.data ?? {},
    createdBy: opts.user.id,
    createdAt: now,
    updatedAt: now,
  };
  store.instances.update((arr) => [inst, ...arr]);
  store.history.update((arr) => [
    {
      id: uid("h"),
      workflowInstanceId: inst.id,
      fromStageId: null,
      toStageId: initial.id,
      actionCode: "create",
      actionName: "إنشاء الطلب",
      performedBy: opts.user.id,
      timestamp: now,
    },
    ...arr,
  ]);
  return inst;
}

export function saveDraftData(instanceId: string, data: Record<string, unknown>, user: WfUser) {
  const now = new Date().toISOString();
  store.instances.update((arr) =>
    arr.map((i) => (i.id === instanceId ? { ...i, data: { ...i.data, ...data }, updatedAt: now } : i)),
  );
  store.history.update((arr) => [
    {
      id: uid("h"),
      workflowInstanceId: instanceId,
      fromStageId: null,
      toStageId: store.instances.get().find((i) => i.id === instanceId)!.currentStageId,
      actionCode: "save_draft",
      actionName: "حفظ مسودة",
      performedBy: user.id,
      timestamp: now,
    },
    ...arr,
  ]);
}

export interface ApplyActionInput {
  instanceId: string;
  transitionId: string;
  user: WfUser;
  comments?: string;
  data?: Record<string, unknown>;
}

export function applyAction(input: ApplyActionInput): { ok: true; instance: WorkflowInstance } | { ok: false; error: string } {
  const instance = store.instances.get().find((i) => i.id === input.instanceId);
  if (!instance) return { ok: false, error: "Instance not found" };
  const transition = store.transitions.get().find((t) => t.id === input.transitionId);
  if (!transition) return { ok: false, error: "Transition not found" };
  if (transition.fromStageId !== instance.currentStageId) {
    return { ok: false, error: "Transition does not apply to current stage" };
  }
  if (!canExecute(instance.currentStageId, input.user)) {
    return { ok: false, error: "User cannot execute this stage" };
  }

  const toStage = store.stages.get().find((s) => s.id === transition.toStageId);
  const now = new Date().toISOString();
  const updated: WorkflowInstance = {
    ...instance,
    currentStageId: transition.toStageId,
    data: { ...instance.data, ...(input.data ?? {}) },
    status: toStage?.isFinal ? "closed" : instance.status,
    updatedAt: now,
  };
  store.instances.update((arr) => arr.map((i) => (i.id === instance.id ? updated : i)));

  const hist: WorkflowHistory = {
    id: uid("h"),
    workflowInstanceId: instance.id,
    fromStageId: instance.currentStageId,
    toStageId: transition.toStageId,
    actionCode: transition.actionCode,
    actionName: transition.actionName,
    performedBy: input.user.id,
    comments: input.comments,
    timestamp: now,
  };
  store.history.update((arr) => [hist, ...arr]);

  return { ok: true, instance: updated };
}

export function getInstanceHistory(instanceId: string): WorkflowHistory[] {
  return store.history.get()
    .filter((h) => h.workflowInstanceId === instanceId)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

// ------------------------------------------------------------
// Versioning helpers
// ------------------------------------------------------------

export function cloneVersion(versionId: string, newVersionLabel: string): WorkflowVersion | null {
  const src = store.versions.get().find((v) => v.id === versionId);
  if (!src) return null;
  const newVersion: WorkflowVersion = {
    id: uid("v"),
    workflowId: src.workflowId,
    version: newVersionLabel,
    isPublished: false,
    createdAt: new Date().toISOString(),
  };
  store.versions.update((arr) => [...arr, newVersion]);

  // copy stage groups, stages, transitions, fieldDefs, fieldRules, assignments
  const stageGroupMap = new Map<string, string>();
  store.stageGroups.get().filter((g) => g.workflowVersionId === versionId).forEach((g) => {
    const id = uid("sg");
    stageGroupMap.set(g.id, id);
    store.stageGroups.update((arr) => [...arr, { ...g, id, workflowVersionId: newVersion.id }]);
  });
  const stageMap = new Map<string, string>();
  store.stages.get().filter((s) => s.workflowVersionId === versionId).forEach((s) => {
    const id = uid("s");
    stageMap.set(s.id, id);
    store.stages.update((arr) => [...arr, {
      ...s, id, workflowVersionId: newVersion.id,
      groupId: s.groupId ? stageGroupMap.get(s.groupId) ?? undefined : undefined,
    }]);
  });
  store.transitions.get().filter((t) => t.workflowVersionId === versionId).forEach((t) => {
    store.transitions.update((arr) => [...arr, {
      ...t,
      id: uid("t"),
      workflowVersionId: newVersion.id,
      fromStageId: stageMap.get(t.fromStageId) ?? t.fromStageId,
      toStageId: stageMap.get(t.toStageId) ?? t.toStageId,
    }]);
  });
  const groupMap = new Map<string, string>();
  store.fieldGroups.get().filter((g) => g.workflowVersionId === versionId).forEach((g) => {
    const id = uid("fg");
    groupMap.set(g.id, id);
    store.fieldGroups.update((arr) => [...arr, { ...g, id, workflowVersionId: newVersion.id }]);
  });
  store.fieldDefs.get().filter((f) => f.workflowVersionId === versionId).forEach((f) => {
    store.fieldDefs.update((arr) => [...arr, {
      ...f,
      id: uid("fd"),
      workflowVersionId: newVersion.id,
      groupId: f.groupId ? groupMap.get(f.groupId) ?? undefined : undefined,
    }]);
  });
  store.fieldRules.get().filter((r) => stageMap.has(r.stageId)).forEach((r) => {
    store.fieldRules.update((arr) => [...arr, { ...r, id: uid("fr"), stageId: stageMap.get(r.stageId)! }]);
  });
  store.assignments.get().filter((a) => stageMap.has(a.stageId)).forEach((a) => {
    store.assignments.update((arr) => [...arr, { ...a, id: uid("a"), stageId: stageMap.get(a.stageId)! }]);
  });

  return newVersion;
}

export function publishVersion(versionId: string) {
  const v = store.versions.get().find((x) => x.id === versionId);
  if (!v) return;
  store.versions.update((arr) =>
    arr.map((x) => (x.workflowId === v.workflowId ? { ...x, isPublished: x.id === versionId } : x)),
  );
  store.definitions.update((arr) =>
    arr.map((d) => (d.id === v.workflowId ? { ...d, activeVersionId: versionId } : d)),
  );
}

// ------------------------------------------------------------
// Lookups
// ------------------------------------------------------------

export function getActions(): WorkflowAction[] {
  return store.actions.get();
}
