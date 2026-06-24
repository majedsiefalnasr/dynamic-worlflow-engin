// ============================================================
// Banks resource. Endpoints: /banks (+ activate/deactivate).
//
// DEGRADED: the API only exposes id/name/code/organization/is_active — it does
// NOT return swift_code / license_number / status (BE-07). Those columns show
// blank in API mode, and the per-bank admin account isn't created here (user
// creation is blocked, BE-14).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Entity } from "@/lib/mock";

interface BankDto {
  id: number;
  name: string;
  code: string;
  license_number?: string | null;
  swift_code?: string | null;
  status?: string | null;
  organization?: { id: number; code: string; name: string } | null;
  organization_id?: number;
  is_active?: boolean;
}

function toEntity(d: BankDto): Entity {
  const suspended = (d.status ?? "").toUpperCase() === "INACTIVE" || d.is_active === false;
  return {
    id: String(d.id),
    type: "bank",
    name: d.name,
    licenseNo: d.license_number ?? "",
    swiftCode: d.swift_code ?? undefined,
    status: suspended ? "suspended" : "active",
  };
}

function slug(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return base || `bank_${Date.now()}`;
}

export const bankKeys = {
  all: ["banks"] as const,
  list: () => [...bankKeys.all, "list"] as const,
};

export function useBanksQuery(enabled: boolean) {
  return useQuery({
    queryKey: bankKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api.getList<BankDto>("/banks", { per_page: 100 }, signal).then((r) => r.data.map(toEntity)),
  });
}

export interface BankInput {
  organizationId: string;
  name: string;
  swiftCode?: string;
  licenseNo?: string;
  status: "active" | "suspended";
}

export function useBankMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: bankKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: BankInput) =>
        api.post("/banks", {
          organization_id: Number(input.organizationId),
          name: input.name,
          code: slug(input.name),
          swift_code: input.swiftCode || undefined,
          license_number: input.licenseNo || undefined,
          status: input.status === "active" ? "ACTIVE" : "INACTIVE",
          is_active: input.status === "active",
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; name: string }) =>
        api.patch(`/banks/${input.id}`, { name: input.name }),
      onSuccess: invalidate,
    }),
    // POST /{id}/activate|deactivate return 406 (CR-12); toggle via PATCH is_active.
    activate: useMutation({
      mutationFn: (id: string) => api.patch(`/banks/${id}`, { is_active: true }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) => api.patch(`/banks/${id}`, { is_active: false }),
      onSuccess: invalidate,
    }),
  };
}
