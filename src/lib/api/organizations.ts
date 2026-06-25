// ============================================================
// Organizations resource. Endpoints: /organizations (+ activate/deactivate).
//
// The backend requires `category` on create/update (enum below) and generates
// the `code` itself (e.g. banks_002) — the code we send is ignored.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { OrgCategory, OrgRecord } from "@/lib/governance";

interface OrgDto {
  id: number;
  code: string;
  name: string;
  category?: string;
  is_system?: boolean;
  is_active?: boolean;
  version?: number;
}

// Backend OrganizationCategory enum ↔ the frontend's OrgCategory.
const TO_BACKEND_CATEGORY: Record<OrgCategory, string> = {
  bank: "banks",
  committee: "national_committee",
  other: "other",
};
const TO_FRONTEND_CATEGORY: Record<string, OrgCategory> = {
  banks: "bank",
  national_committee: "committee",
  other: "other",
};

function toOrgRecord(d: OrgDto): OrgRecord {
  return {
    id: String(d.id),
    label: d.name,
    active: d.is_active ?? true,
    builtin: d.is_system,
    category: TO_FRONTEND_CATEGORY[d.category ?? ""] ?? "other",
    _version: d.version,
  };
}

/** A lowercase, snake_case code derived from a label (backend regenerates it anyway). */
function slugCode(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return base || `org_${Date.now()}`;
}

export const organizationKeys = {
  all: ["organizations"] as const,
  list: () => [...organizationKeys.all, "list"] as const,
};

export function useOrganizationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: organizationKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<OrgDto>("/organizations", { per_page: 100 }, signal)
        .then((r) => r.data.map(toOrgRecord)),
  });
}

export function useOrganizationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: organizationKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: { name: string; category: OrgCategory }) =>
        api.post("/organizations", {
          code: slugCode(input.name),
          name: input.name,
          category: TO_BACKEND_CATEGORY[input.category],
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; version: number; name: string; category: OrgCategory }) =>
        api.patch(`/organizations/${input.id}`, {
          name: input.name,
          category: TO_BACKEND_CATEGORY[input.category],
          version: input.version,
        }),
      onSuccess: invalidate,
    }),
    // Backend POST /{id}/activate|deactivate return 406 (CR-03); toggle via PATCH is_active.
    activate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/organizations/${input.id}`, { is_active: true, version: input.version }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (input: { id: string; version: number }) =>
        api.patch(`/organizations/${input.id}`, { is_active: false, version: input.version }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del(`/organizations/${id}`),
      onSuccess: invalidate,
    }),
  };
}
