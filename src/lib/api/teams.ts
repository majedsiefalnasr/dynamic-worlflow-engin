// ============================================================
// Teams resource. Endpoints: /teams (+ activate/deactivate).
// Backend team carries NO role (the user holds the role). DELETE is broken
// server-side (500), so "remove" maps to deactivate.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { TeamRecord } from "@/lib/governance";
import type { RoleId } from "@/lib/mock";

interface TeamDto {
  id: number;
  organization?: { id: number; code: string; name: string } | null;
  organization_id?: number;
  code: string;
  name: string;
  is_system?: boolean;
  is_active?: boolean;
  version?: number;
}

function toTeamRecord(d: TeamDto): TeamRecord {
  return {
    id: String(d.id),
    label: d.name,
    orgKind: String(d.organization_id ?? d.organization?.id ?? ""),
    roleCode: "" as RoleId, // backend team has no role
    active: d.is_active ?? true,
    builtin: d.is_system,
    code: d.code,
    _version: d.version,
  };
}

function slug(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return base || `team_${Date.now()}`;
}

export const teamKeys = {
  all: ["teams"] as const,
  list: () => [...teamKeys.all, "list"] as const,
};

export function useTeamsQuery(enabled: boolean) {
  return useQuery({
    queryKey: teamKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<TeamDto>("/teams", { per_page: 100 }, signal)
        .then((r) => r.data.map(toTeamRecord)),
  });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: teamKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: { organizationId: string; name: string }) =>
        api.post("/teams", {
          organization_id: Number(input.organizationId),
          code: slug(input.name),
          name: input.name,
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; version: number; name: string }) =>
        api.patch(`/teams/${input.id}`, { name: input.name, version: input.version }),
      onSuccess: invalidate,
    }),
    // POST /{id}/activate|deactivate return 406 (CR-03); toggle via PATCH is_active.
    activate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/teams/${input.id}`, { is_active: true, version: input.version }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/teams/${input.id}`, { is_active: false, version: input.version }),
      onSuccess: invalidate,
    }),
  };
}
