// ============================================================
// Workflow Designer sync. The designer's tabs all read wfStore, so instead of
// rewriting them we load the live published workflow from the API into wfStore
// on mount, and mutation hooks below write through to the live API then
// invalidate this query so wfStore reflects the server's new state.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { wfStore } from "@/lib/workflow-engine";
import type { DynamicSource, FieldType, WorkflowAction } from "@/lib/workflow-engine";

const SYNC_KEY = ["workflow-sync"];

interface DefDto {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  created_at?: string;
}
interface VerDto {
  id: number;
  workflow_definition_id: number;
  version_number: number;
  status?: string;
  published_at?: string | null;
}
interface StageDto {
  id: number;
  code: string;
  name: string;
  sort_order?: number;
  is_initial?: boolean;
  is_final?: boolean;
}
interface ActionDto {
  id: number;
  code: string;
  name: string;
  kind?: string;
}
interface TransDto {
  id: number;
  from_stage_id: number;
  to_stage_id: number;
  action_id: number;
}
interface GroupDto {
  id: number;
  label: string;
  sort_order?: number;
}
interface FieldDto {
  id: number;
  field_group_id?: number | null;
  key: string;
  label: string;
  type?: string;
  options?: string[] | null;
  dynamic_source?: string | null;
}
interface PermDto {
  id: number;
  stage_id: number;
  organization_id?: number | null;
  team_id?: number | null;
  role_id?: number | null;
  user_id?: number | null;
  access_level?: string;
}
interface RuleDto {
  id: number;
  stage_id: number;
  field_id: number;
  is_visible?: boolean;
  is_editable?: boolean;
  is_required?: boolean;
}

/** Loads every live workflow + every version into wfStore. Returns the first definition's id (or null). */
export function useWorkflowSync(enabled: boolean) {
  return useQuery({
    queryKey: SYNC_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<string | null> => {
      const defs = await api.getList<DefDto>("/workflows", { per_page: 50 }, signal);
      if (defs.data.length === 0) return null;

      const allStages: ReturnType<typeof wfStore.stages.get> = [];
      const allActions: ReturnType<typeof wfStore.actions.get> = [];
      const allTransitions: ReturnType<typeof wfStore.transitions.get> = [];
      const allGroups: ReturnType<typeof wfStore.fieldGroups.get> = [];
      const allFields: ReturnType<typeof wfStore.fieldDefs.get> = [];
      const allRules: ReturnType<typeof wfStore.fieldRules.get> = [];
      const allAssignments: ReturnType<typeof wfStore.assignments.get> = [];
      const allVersions: ReturnType<typeof wfStore.versions.get> = [];
      const allDefs: ReturnType<typeof wfStore.definitions.get> = [];

      const actions = await api.getList<ActionDto>(`/workflow-actions`, { per_page: 100 }, signal);
      const actionById = new Map(actions.data.map((a) => [a.id, a]));
      allActions.push(
        ...actions.data.map((a) => ({
          id: String(a.id),
          code: a.code,
          name: a.name,
          kind: (a.kind ?? "").toLowerCase() as WorkflowAction["kind"],
        })),
      );

      for (const def of defs.data) {
        const versions = await api.getList<VerDto>(
          `/workflows/${def.id}/versions`,
          { per_page: 50 },
          signal,
        );
        const published = versions.data.find((ver) => ver.status === "PUBLISHED");
        allDefs.push({
          id: String(def.id),
          code: def.code,
          name: def.name,
          description: def.description ?? undefined,
          activeVersionId: published ? String(published.id) : String(versions.data[0]?.id ?? ""),
          createdAt: def.created_at ?? "",
        });

        for (const ver of versions.data) {
          const vid = ver.id;
          const v = String(vid);
          allVersions.push({
            id: v,
            workflowId: String(def.id),
            version: String(ver.version_number),
            isPublished: ver.status === "PUBLISHED",
            createdAt: ver.published_at ?? "",
          });

          const [stages, transitions, fields, groups] = await Promise.all([
            api.getList<StageDto>(`/workflow-versions/${vid}/stages`, { per_page: 100 }, signal),
            api.getList<TransDto>(
              `/workflow-versions/${vid}/transitions`,
              { per_page: 100 },
              signal,
            ),
            api.getList<FieldDto>(`/workflow-versions/${vid}/fields`, { per_page: 200 }, signal),
            api.getList<GroupDto>(
              `/workflow-versions/${vid}/field-groups`,
              { per_page: 100 },
              signal,
            ),
          ]);
          const fieldById = new Map(fields.data.map((f) => [f.id, f]));

          // Per-stage permissions + field rules (N+1 over a handful of stages).
          const perms: PermDto[] = [];
          const rules: RuleDto[] = [];
          for (const s of stages.data) {
            const [p, fr] = await Promise.all([
              api.getList<PermDto>(`/stages/${s.id}/permissions`, undefined, signal),
              api.getList<RuleDto>(`/stages/${s.id}/field-rules`, undefined, signal),
            ]);
            perms.push(...p.data);
            rules.push(...fr.data);
          }

          allStages.push(
            ...stages.data.map((s) => ({
              id: String(s.id),
              workflowVersionId: v,
              code: s.code,
              name: s.name,
              order: s.sort_order ?? 0,
              isInitial: s.is_initial,
              isFinal: s.is_final,
            })),
          );
          allTransitions.push(
            ...transitions.data.map((t) => {
              const a = actionById.get(t.action_id);
              return {
                id: String(t.id),
                workflowVersionId: v,
                fromStageId: String(t.from_stage_id),
                toStageId: String(t.to_stage_id),
                actionCode: a?.code ?? "",
                actionName: a?.name ?? "",
              };
            }),
          );
          allGroups.push(
            ...groups.data.map((g) => ({
              id: String(g.id),
              workflowVersionId: v,
              name: g.label,
              order: g.sort_order ?? 0,
              system: true,
            })),
          );
          allFields.push(
            ...fields.data.map((f) => ({
              id: String(f.id),
              workflowVersionId: v,
              key: f.key,
              label: f.label,
              type: (f.type ?? "text").toLowerCase() as FieldType,
              options: f.options ?? undefined,
              sourceTable: (f.dynamic_source ?? undefined) as DynamicSource | undefined,
              groupId: f.field_group_id != null ? String(f.field_group_id) : undefined,
              system: true,
            })),
          );
          allRules.push(
            ...rules.map((r) => ({
              id: String(r.id),
              stageId: String(r.stage_id),
              fieldKey: fieldById.get(r.field_id)?.key ?? "",
              visible: r.is_visible ?? true,
              editable: r.is_editable ?? false,
              required: r.is_required ?? false,
            })),
          );
          allAssignments.push(
            ...perms.map((p) => ({
              id: String(p.id),
              stageId: String(p.stage_id),
              organizationId: p.organization_id != null ? String(p.organization_id) : undefined,
              teamId: p.team_id != null ? String(p.team_id) : undefined,
              roleId: p.role_id != null ? String(p.role_id) : undefined,
              userId: p.user_id != null ? String(p.user_id) : undefined,
              viewOnly: p.access_level !== "EXECUTE",
            })),
          );
        }
      }

      wfStore.definitions.set(allDefs);
      wfStore.versions.set(allVersions);
      wfStore.stages.set(allStages);
      wfStore.actions.set(allActions);
      wfStore.transitions.set(allTransitions);
      wfStore.fieldGroups.set(allGroups);
      wfStore.fieldDefs.set(allFields);
      wfStore.fieldRules.set(allRules);
      wfStore.assignments.set(allAssignments);
      // No backend equivalent for these — clear so stale mock rows don't show.
      wfStore.stageGroups.set([]);
      wfStore.stageRoutingRules.set([]);

      return allDefs[0]?.id ?? null;
    },
  });
}

interface StageWriteBody {
  code?: string;
  name?: string;
  sort_order?: number;
  is_initial?: boolean;
  is_final?: boolean;
}

/** Creates a stage on a DRAFT version via the live API, then re-syncs wfStore. */
export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number; body: StageWriteBody }) =>
      api.post(`/workflow-versions/${vars.versionId}/stages`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stageId: number; body: StageWriteBody }) =>
      api.patch(`/stages/${vars.stageId}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stageId: number }) => api.del(`/stages/${vars.stageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface VersionPayload {
  id: number;
}

/** Creates a new DRAFT version on a workflow definition. */
export function useCreateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { workflowId: number }) =>
      api.post<VersionPayload>(`/workflows/${vars.workflowId}/versions`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

/** Clones a DRAFT version (with all its stages/transitions/fields) into a new DRAFT version. */
export function useCloneVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number }) =>
      api.post<VersionPayload>(`/workflow-versions/${vars.versionId}/clone`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

/** Publishes a DRAFT version (validates structure server-side; 422 on failure). */
export function usePublishVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number }) =>
      api.post<VersionPayload>(`/workflow-versions/${vars.versionId}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface TransitionWriteBody {
  from_stage_id?: number;
  to_stage_id?: number;
  action_id?: number;
  requires_comment?: boolean;
  confirmation_message?: string | null;
}

export function useCreateTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number; body: TransitionWriteBody }) =>
      api.post(`/workflow-versions/${vars.versionId}/transitions`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { transitionId: number }) => api.del(`/transitions/${vars.transitionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface PermissionWriteBody {
  organization_id?: number | null;
  team_id?: number | null;
  role_id?: number | null;
  user_id?: number | null;
  access_level: "VIEW" | "EXECUTE";
}

export function useCreateStagePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stageId: number; body: PermissionWriteBody }) =>
      api.post(`/stages/${vars.stageId}/permissions`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteStagePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stageId: number; permissionId: number }) =>
      api.del(`/stages/${vars.stageId}/permissions/${vars.permissionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface FieldGroupWriteBody {
  code?: string;
  label?: string;
  sort_order?: number;
}

export function useCreateFieldGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number; body: FieldGroupWriteBody }) =>
      api.post(`/workflow-versions/${vars.versionId}/field-groups`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteFieldGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { groupId: number }) => api.del(`/field-groups/${vars.groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface FieldWriteBody {
  field_group_id?: number | null;
  key?: string;
  label?: string;
  type?: string;
  options?: string[] | null;
  reference_table_id?: number | null;
  dynamic_source?: string | null;
  sort_order?: number;
}

export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: number; body: FieldWriteBody }) =>
      api.post(`/workflow-versions/${vars.versionId}/fields`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fieldId: number; body: FieldWriteBody }) =>
      api.patch(`/fields/${vars.fieldId}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fieldId: number }) => api.del(`/fields/${vars.fieldId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface FieldRuleItem {
  field_id: number;
  is_visible?: boolean;
  is_editable?: boolean;
  is_required?: boolean;
}

/** Full replace of a stage's field rules. */
export function useUpdateStageFieldRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stageId: number; rules: FieldRuleItem[] }) =>
      api.put(`/stages/${vars.stageId}/field-rules`, { field_rules: vars.rules }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

interface ActionWriteBody {
  code?: string;
  name?: string;
  kind?: string;
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: ActionWriteBody }) => api.post("/workflow-actions", vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { actionId: number }) => api.del(`/workflow-actions/${vars.actionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}
