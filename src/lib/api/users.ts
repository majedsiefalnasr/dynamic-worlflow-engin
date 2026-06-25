// ============================================================
// Users resource. Endpoints: /users (+ activate/deactivate).
// CR-02 confirmed closed in backend code (2026-06-25): role_id is the
// canonical required field on create; the legacy `role` string is optional.
// CR-03 confirmed closed: activate/deactivate return 200/403, not 406.
// CR-04 still open: /users has no OpenAPI documentation (route exists live,
// confirmed via `curl .../api/v1/users` -> 401, not 404) — this DTO is
// hand-typed from backend/ source (StoreUserRequest/UpdateUserRequest/
// UserResource), not generated. Re-check against backend/ if fields look
// wrong at runtime.
//
// `roleId` maps to the role's `code` (e.g. "rc_bank_admin"), not its numeric
// id — every other part of the app (role labels, permission checks) looks up
// roles by code. `orgKind` is derived from the organization's `category`
// field (DB-driven), never a hardcoded id/code lookup.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { OrgKind, RoleId, User } from "@/lib/mock";

interface UserDto {
  id: number;
  version: number;
  name: string;
  email: string;
  phone?: string | null;
  role_id: number;
  role?: { id: number; code: string; name: string } | null;
  role_label?: string;
  organization?: { id: number; code: string; name: string; category?: string } | null;
  organization_id?: number;
  team?: { id: number; code: string; name: string } | null;
  team_id?: number;
  bank_id?: number | null;
  bank?: { id: number; code: string; name: string } | null;
  bank_name?: string;
  is_active?: boolean;
}

/** Backend organization `category` -> the frontend's free-form OrgKind. DB-driven, no hardcoded id/code lookups. */
function categoryToOrgKind(category?: string): OrgKind {
  if (category === "banks") return "bank";
  if (category === "national_committee") return "committee";
  return "platform";
}

function toUser(d: UserDto): User {
  return {
    id: String(d.id),
    name: d.name,
    email: d.email,
    // CR-04 risk: if backend returns no `role` and falsy/0 `role_id`, fallback string won't match ROLE_LABELS; flagged here since RoleId is open union.
    roleId: (d.role?.code ?? String(d.role_id)) as RoleId,
    entityId: d.bank_id != null ? String(d.bank_id) : null,
    org: d.organization?.name ?? d.bank?.name ?? "",
    avatar: d.name.slice(0, 2),
    active: d.is_active ?? true,
    phone: d.phone ?? undefined,
    orgKind: categoryToOrgKind(d.organization?.category),
    teamId: d.team?.code,
    _orgId: d.organization_id != null ? String(d.organization_id) : (d.organization?.id != null ? String(d.organization.id) : undefined),
    _teamId: d.team_id != null ? String(d.team_id) : (d.team?.id != null ? String(d.team.id) : undefined),
    _version: d.version,
  };
}

export const userKeys = {
  all: ["users"] as const,
  list: (filters?: { organizationId?: string; bankId?: string }) =>
    [...userKeys.all, "list", filters ?? {}] as const,
};

export function useUsersQuery(
  enabled: boolean,
  filters?: { organizationId?: string; bankId?: string },
) {
  return useQuery({
    queryKey: userKeys.list(filters),
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<UserDto>(
          "/users",
          {
            per_page: 100,
            organization_id: filters?.organizationId ? Number(filters.organizationId) : undefined,
            bank_id: filters?.bankId ? Number(filters.bankId) : undefined,
          },
          signal,
        )
        .then((r) => r.data.map(toUser)),
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: userKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: {
        name: string;
        email: string;
        password: string;
        organizationId: string;
        teamId: string;
        roleId: string;
        bankId?: string;
        phone?: string;
      }) =>
        api.post("/users", {
          name: input.name,
          email: input.email,
          password: input.password,
          organization_id: Number(input.organizationId),
          team_id: Number(input.teamId),
          role_id: Number(input.roleId),
          bank_id: input.bankId ? Number(input.bankId) : undefined,
          phone: input.phone || undefined,
        }),
      onSuccess: invalidate,
    }),
    // Callers must pass `_version` from freshly fetched User, not stale cached — backend's optimistic-lock on PATCH /users/{id} rejects 409 if version mismatch.
    update: useMutation({
      mutationFn: (input: {
        id: string;
        version: number;
        name: string;
        email: string;
        roleId: string;
        teamId: string;
        phone?: string;
      }) =>
        api.patch(`/users/${input.id}`, {
          version: input.version,
          name: input.name,
          email: input.email,
          role_id: Number(input.roleId),
          team_id: Number(input.teamId),
          phone: input.phone || undefined,
        }),
      onSuccess: invalidate,
    }),
    activate: useMutation({
      mutationFn: (id: string) => api.post(`/users/${id}/activate`),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) => api.post(`/users/${id}/deactivate`),
      onSuccess: invalidate,
    }),
  };
}
