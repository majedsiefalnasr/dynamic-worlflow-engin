// ============================================================
// Reference Data resource — first screen migrated onto the live backend.
// Endpoints: /reference-tables (+ /values), /reference-values/*.
//
// Hooks map the backend snake_case DTO onto the screen's existing
// `ReferenceTable` shape so the UI stays unchanged.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ReferenceTable } from "@/lib/governance";

// ---------- Backend DTOs ----------

interface RefValueDto {
  id: number;
  key: string;
  label: string;
  is_active?: boolean;
  is_system?: boolean;
}

interface RefTableDto {
  id: number;
  key: string;
  label: string;
  is_system?: boolean;
  values?: RefValueDto[];
}

// NOTE: assumes GET /reference-tables nests `values`. Confirm with backend
// (BE-06/BE-09); if values come separately this maps to empty arrays, not a crash.
function toScreenTable(dto: RefTableDto): ReferenceTable {
  return {
    id: String(dto.id),
    key: dto.key,
    label: dto.label,
    system: dto.is_system,
    values: (dto.values ?? []).map((v) => ({ id: String(v.id), key: v.key, label: v.label })),
  };
}

// ---------- Query keys ----------

export const referenceKeys = {
  all: ["reference-tables"] as const,
  list: () => [...referenceKeys.all, "list"] as const,
};

// ---------- Query ----------

export function useReferenceTablesQuery(enabled: boolean) {
  return useQuery({
    queryKey: referenceKeys.list(),
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<RefTableDto>("/reference-tables", { per_page: 100 }, signal)
        .then((r) => r.data.map(toScreenTable)),
  });
}

// ---------- Mutations ----------

export function useReferenceMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: referenceKeys.all });

  const createTable = useMutation({
    mutationFn: (input: { key: string; label: string }) => api.post("/reference-tables", input),
    onSuccess: invalidate,
  });
  const createValue = useMutation({
    mutationFn: (input: { tableId: string; key: string; label: string }) =>
      api.post(`/reference-tables/${input.tableId}/values`, { key: input.key, label: input.label }),
    onSuccess: invalidate,
  });
  // No hard delete — "remove" deactivates. POST /{id}/deactivate returns 406
  // (CR-12), so deactivate via PATCH is_active.
  const deactivateTable = useMutation({
    mutationFn: (id: string) => api.patch(`/reference-tables/${id}`, { is_active: false }),
    onSuccess: invalidate,
  });
  const deactivateValue = useMutation({
    mutationFn: (id: string) => api.patch(`/reference-values/${id}`, { is_active: false }),
    onSuccess: invalidate,
  });

  return { createTable, createValue, deactivateTable, deactivateValue };
}
