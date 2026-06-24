// ============================================================
// Workflow Designer — READ-ONLY sync. The designer's 8 tabs all read wfStore,
// so instead of rewriting them we load the live published workflow from the API
// into wfStore once on mount. Editing is still write-blocked (CR-14): any local
// edits do NOT persist and are overwritten on the next sync — the screen shows a
// read-only banner.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { wfStore } from "@/lib/workflow-engine";
import type { DynamicSource, FieldType, WorkflowAction } from "@/lib/workflow-engine";

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

/** Loads the live published workflow into wfStore. Returns the version id (or null). */
export function useWorkflowSync(enabled: boolean) {
  return useQuery({
    queryKey: ["workflow-sync"],
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<string | null> => {
      const defs = await api.getList<DefDto>("/workflows", { per_page: 50 }, signal);
      const def = defs.data[0];
      if (!def) return null;

      const versions = await api.getList<VerDto>(
        `/workflows/${def.id}/versions`,
        { per_page: 50 },
        signal,
      );
      const published = versions.data.find((v) => v.status === "PUBLISHED") ?? versions.data[0];
      if (!published) return null;
      const vid = published.id;
      const v = String(vid);

      const [stages, transitions, fields, groups, actions] = await Promise.all([
        api.getList<StageDto>(`/workflow-versions/${vid}/stages`, { per_page: 100 }, signal),
        api.getList<TransDto>(`/workflow-versions/${vid}/transitions`, { per_page: 100 }, signal),
        api.getList<FieldDto>(`/workflow-versions/${vid}/fields`, { per_page: 200 }, signal),
        api.getList<GroupDto>(`/workflow-versions/${vid}/field-groups`, { per_page: 100 }, signal),
        api.getList<ActionDto>(`/workflow-actions`, { per_page: 100 }, signal),
      ]);

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

      const actionById = new Map(actions.data.map((a) => [a.id, a]));
      const fieldById = new Map(fields.data.map((f) => [f.id, f]));

      wfStore.definitions.set([
        {
          id: String(def.id),
          code: def.code,
          name: def.name,
          description: def.description ?? undefined,
          activeVersionId: v,
          createdAt: def.created_at ?? "",
        },
      ]);
      wfStore.versions.set([
        {
          id: v,
          workflowId: String(def.id),
          version: String(published.version_number),
          isPublished: true,
          createdAt: published.published_at ?? "",
        },
      ]);
      wfStore.stages.set(
        stages.data.map((s) => ({
          id: String(s.id),
          workflowVersionId: v,
          code: s.code,
          name: s.name,
          order: s.sort_order ?? 0,
          isInitial: s.is_initial,
          isFinal: s.is_final,
        })),
      );
      wfStore.actions.set(
        actions.data.map((a) => ({
          id: String(a.id),
          code: a.code,
          name: a.name,
          kind: (a.kind ?? "").toLowerCase() as WorkflowAction["kind"],
        })),
      );
      wfStore.transitions.set(
        transitions.data.map((t) => {
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
      wfStore.fieldGroups.set(
        groups.data.map((g) => ({
          id: String(g.id),
          workflowVersionId: v,
          name: g.label,
          order: g.sort_order ?? 0,
          system: true,
        })),
      );
      wfStore.fieldDefs.set(
        fields.data.map((f) => ({
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
      wfStore.fieldRules.set(
        rules.map((r) => ({
          id: String(r.id),
          stageId: String(r.stage_id),
          fieldKey: fieldById.get(r.field_id)?.key ?? "",
          visible: r.is_visible ?? true,
          editable: r.is_editable ?? false,
          required: r.is_required ?? false,
        })),
      );
      wfStore.assignments.set(
        perms.map((p) => ({
          id: String(p.id),
          stageId: String(p.stage_id),
          organizationId: p.organization_id != null ? String(p.organization_id) : undefined,
          teamId: p.team_id != null ? String(p.team_id) : undefined,
          roleId: p.role_id != null ? String(p.role_id) : undefined,
          userId: p.user_id != null ? String(p.user_id) : undefined,
          viewOnly: p.access_level !== "EXECUTE",
        })),
      );
      // No backend equivalent for these — clear so stale mock rows don't show.
      wfStore.stageGroups.set([]);
      wfStore.stageRoutingRules.set([]);

      return v;
    },
  });
}
