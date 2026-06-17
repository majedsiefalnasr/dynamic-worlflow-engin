// ============================================================
// Dynamic Workflow Engine — Type Definitions
// Metadata-driven, configuration-first workflow system.
// ============================================================

export type ID = string;

// ---------- Organizations / Teams / Roles / Users ----------

export interface WfOrganization {
  id: ID;
  name: string;
}

export interface WfTeam {
  id: ID;
  organizationId: ID;
  name: string;
}

export interface WfRole {
  id: ID;
  code: string;
  name: string;
}

export interface WfUser {
  id: ID;
  fullName: string;
  email?: string;
  organizationId: ID;
  teamIds: ID[];
  roleIds: ID[];
}

// ---------- Workflow definition ----------

export interface WorkflowDefinition {
  id: ID;
  code: string;
  name: string;
  description?: string;
  activeVersionId: ID | null;
  createdAt: string;
}

export interface WorkflowVersion {
  id: ID;
  workflowId: ID;
  version: string;
  isPublished: boolean;
  createdAt: string;
}

export interface WorkflowStage {
  id: ID;
  workflowVersionId: ID;
  code: string;
  name: string;
  order: number;
  isInitial?: boolean;
  isFinal?: boolean;
  /** Display name shown in the request screen's organizational-process view. */
  processLabel?: string;
  /** Optional stage group this stage belongs to (drives org-process visibility). */
  groupId?: ID;
}

/**
 * A single audience rule for a stage group. Each unset field means "any"
 * (e.g. an org with no team/role matches everyone in that org). A user
 * matches the rule only when every set field matches their identity.
 */
export interface StageGroupAudience {
  organizationId?: ID;
  teamId?: ID;
  roleId?: ID;
}

/**
 * A group of stages shown in the request's organizational-process view.
 * Visibility is scoped by a list of audience rules (org → team → role) —
 * a user sees the group when they match ANY rule. No rules = visible to all.
 */
export interface StageGroup {
  id: ID;
  workflowVersionId: ID;
  name: string;
  order: number;
  audiences?: StageGroupAudience[];
}

export interface WorkflowAction {
  id: ID;
  code: string;
  name: string;
  /** "draft" lets the actor save without leaving the stage. */
  kind?: "draft" | "approve" | "reject" | "return" | "close" | "info" | "custom";
}

export interface WorkflowTransition {
  id: ID;
  workflowVersionId: ID;
  fromStageId: ID;
  toStageId: ID;
  actionCode: string;
  actionName: string;
}

// ---------- Stage Assignment (who can execute what) ----------

export interface StageAssignment {
  id: ID;
  stageId: ID;
  organizationId?: ID;
  teamId?: ID;
  roleId?: ID;
  userId?: ID;
  /** view-only assignment cannot perform actions */
  viewOnly?: boolean;
}

// ---------- Field rule engine ----------

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "dynamic_select"
  | "textarea"
  | "file"
  | "currency"
  | "checkbox";

/** Reference data tables that a `dynamic_select` field can source options from. */
export type DynamicSource = "merchants";

/** A tab/section that groups related fields on the request screen. */
export interface FieldGroup {
  id: ID;
  workflowVersionId: ID;
  name: string;
  order: number;
}

export interface FieldDefinition {
  id: ID;
  workflowVersionId: ID;
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** For `dynamic_select`: which reference table supplies the options. */
  sourceTable?: DynamicSource;
  helpText?: string;
  /** Optional group/tab this field belongs to; ungrouped → "عام" tab. */
  groupId?: ID;
}

export interface FieldRule {
  id: ID;
  stageId: ID;
  fieldKey: string;
  visible: boolean;
  editable: boolean;
  required: boolean;
}

// ---------- Workflow instances + history ----------

export interface WorkflowInstance {
  id: ID;
  workflowVersionId: ID;
  currentStageId: ID;
  status: "active" | "closed" | "rejected";
  data: Record<string, unknown>;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowHistory {
  id: ID;
  workflowInstanceId: ID;
  fromStageId: ID | null;
  toStageId: ID;
  actionCode: string;
  actionName: string;
  performedBy: ID;
  comments?: string;
  timestamp: string;
}
