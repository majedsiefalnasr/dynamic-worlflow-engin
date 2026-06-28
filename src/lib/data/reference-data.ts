// ============================================================
// Reference Data adapter (template resource — spec §6). Exposes a
// stable hook surface; picks mock vs live via source(). DTO<->domain
// mapping lives here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { referenceTablesCell, type ReferenceTable, type ReferenceValue } from "@/lib/governance";

// Re-export types for adapter consumers (spec §6)
export type { ReferenceTable, ReferenceValue } from "@/lib/governance";

const KEY = "reference-data" as const;

// ---------- Query key factory (spec §3.6) ----------
export const referenceKeys = {
  all: [KEY] as const,
  lists: () => [...referenceKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...referenceKeys.lists(), filters ?? {}] as const,
  details: () => [...referenceKeys.all, "detail"] as const,
  detail: (id: string) => [...referenceKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface RefValueDto {
  id: number;
  key: string;
  label: string;
  version?: number;
  is_system?: boolean;
}
interface RefTableDto {
  id: number;
  key: string;
  label: string;
  is_system?: boolean;
  version?: number;
  values?: RefValueDto[];
}

export function toReferenceTable(dto: RefTableDto): ReferenceTable {
  return {
    id: String(dto.id),
    key: dto.key,
    label: dto.label,
    system: dto.is_system,
    _version: dto.version,
    values: (dto.values ?? []).map((v) => ({
      id: String(v.id),
      key: v.key,
      label: v.label,
      _version: v.version,
    })),
  };
}

// ---------- Read hook ----------
export function useReferenceTables(): ReadResult<ReferenceTable[]> {
  const live = source(KEY) === "live";
  const cell = referenceTablesCell.use();
  const query = useQuery({
    queryKey: referenceKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<RefTableDto>("/reference-tables", { per_page: 100 }, signal).then((r) => {
        const tables = r.data.map(toReferenceTable);
        referenceTablesCell.set(tables); // hydrate cell as sync lookup cache (spec §3.4)
        return tables;
      }),
  });

  if (!live) return mockRead(cell);
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: (query.error as ReadResult<unknown>["error"]) ?? null,
    refetch: () => void query.refetch(),
  };
}

// ---------- Mutations ----------
function useLiveMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: referenceKeys.lists() });

  const createTable = useMutation({
    mutationFn: (i: { key: string; label: string }) =>
      api.post<RefTableDto>("/reference-tables", i).then(toReferenceTable),
    onSuccess: invalidate,
  });
  const createValue = useMutation({
    mutationFn: (i: { tableId: string; key: string; label: string }) =>
      api
        .post<RefValueDto>(`/reference-tables/${i.tableId}/values`, { key: i.key, label: i.label })
        .then(
          (v) =>
            ({
              id: String(v.id),
              key: v.key,
              label: v.label,
              _version: v.version,
            }) as ReferenceValue,
        ),
    onSuccess: invalidate,
  });
  const removeTable = useMutation({
    mutationFn: (i: { id: string }) =>
      api.post(`/reference-tables/${i.id}/deactivate`).then(() => undefined),
    onSuccess: invalidate,
  });
  const removeValue = useMutation({
    mutationFn: (i: { id: string }) =>
      api.post(`/reference-values/${i.id}/deactivate`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createTable, createValue, removeTable, removeValue };
}

function handle<TInput, TResult>(m: {
  mutateAsync: (i: TInput) => Promise<TResult>;
  isPending: boolean;
  error: unknown;
  reset: () => void;
}): MutationHandle<TInput, TResult> {
  return {
    mutate: (i) => m.mutateAsync(i),
    isPending: m.isPending,
    error: (m.error as MutationHandle<TInput, TResult>["error"]) ?? null,
    reset: m.reset,
  };
}

const idle = { isPending: false, error: null as null, reset: () => {} };

export function useReferenceMutations() {
  const live = source(KEY) === "live";
  const liveM = useLiveMutations(); // hooks run every render regardless (stable order)

  if (live) {
    return {
      createTable: handle(liveM.createTable),
      createValue: handle(liveM.createValue),
      removeTable: handle(liveM.removeTable),
      removeValue: handle(liveM.removeValue),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createTable: {
      ...idle,
      mutate: async (i: { key: string; label: string }) => {
        const t: ReferenceTable = {
          id: `rt_${Date.now()}`,
          key: i.key,
          label: i.label,
          values: [],
        };
        referenceTablesCell.set((prev) => [...prev, t]);
        return t;
      },
    } as MutationHandle<{ key: string; label: string }, ReferenceTable>,
    createValue: {
      ...idle,
      mutate: async (i: { tableId: string; key: string; label: string }) => {
        const v: ReferenceValue = { id: `rv_${Date.now()}`, key: i.key, label: i.label };
        referenceTablesCell.set((prev) =>
          prev.map((t) => (t.id === i.tableId ? { ...t, values: [...t.values, v] } : t)),
        );
        return v;
      },
    } as MutationHandle<{ tableId: string; key: string; label: string }, ReferenceValue>,
    removeTable: {
      ...idle,
      mutate: async (i: { id: string }) => {
        referenceTablesCell.set((prev) => prev.filter((t) => t.id !== i.id));
      },
    } as MutationHandle<{ id: string }>,
    removeValue: {
      ...idle,
      mutate: async (i: { id: string }) => {
        referenceTablesCell.set((prev) =>
          prev.map((t) => ({ ...t, values: t.values.filter((v) => v.id !== i.id) })),
        );
      },
    } as MutationHandle<{ id: string }>,
  };
}
