// ============================================================
// Roles resource. Endpoints: /roles (+ activate/deactivate).
// No working hard delete server-side, so "remove" maps to deactivate.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { RoleCatalogEntry } from "@/lib/governance";

interface RoleDto {
  id: number;
  organization?: { id: number; code: string; name: string } | null;
  organization_id?: number;
  code: string;
  name: string;
  is_system?: boolean;
  is_active?: boolean;
  version?: number;
}

function toRoleEntry(d: RoleDto): RoleCatalogEntry {
  return {
    id: String(d.id),
    name: d.name,
    orgId: String(d.organization_id ?? d.organization?.id ?? ""),
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
  return base || `role_${Date.now()}`;
}

export const roleKeys = {
  all: ["roles"] as const,
  list: () => [...roleKeys.all, "list"] as const,
};

export function useRolesQuery(enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<RoleDto>("/roles", { per_page: 100 }, signal)
        .then((r) => r.data.map(toRoleEntry)),
  });
}

export function useRoleMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: roleKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: { organizationId: string; name: string }) =>
        api.post("/roles", {
          organization_id: Number(input.organizationId),
          code: slug(input.name),
          name: input.name,
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; version: number; name: string }) =>
        api.patch(`/roles/${input.id}`, { name: input.name, version: input.version }),
      onSuccess: invalidate,
    }),
    // POST /{id}/activate|deactivate return 406 (CR-03); toggle via PATCH is_active.
    activate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/roles/${input.id}`, { is_active: true, version: input.version }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/roles/${input.id}`, { is_active: false, version: input.version }),
      onSuccess: invalidate,
    }),
  };
}
