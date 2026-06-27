// ============================================================
// Organizations adapter (spec §6). Exposes a stable hook surface;
// picks mock vs live via source(). DTO<->domain mapping lives
// here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { orgsCell, logAudit, type OrgRecord, type OrgCategory } from "@/lib/governance";

// Re-export types for adapter consumers (spec §6)
export type { OrgRecord, OrgCategory } from "@/lib/governance";

const KEY = "organizations" as const;

// ---------- Query key factory (spec §3.6) ----------
export const organizationKeys = {
  all: [KEY] as const,
  lists: () => [...organizationKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...organizationKeys.lists(), filters ?? {}] as const,
  details: () => [...organizationKeys.all, "detail"] as const,
  detail: (id: number) => [...organizationKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface OrgDto {
  id: number;
  slug: string; // → code
  name: string; // → label
  is_active: boolean; // → active
  is_system: boolean; // → builtin
  version?: number; // → _version
  metadata?: { category?: OrgCategory };
}

export function toOrgRecord(dto: OrgDto): OrgRecord {
  return {
    id: dto.id,
    code: dto.slug,
    label: dto.name,
    category: dto.metadata?.category ?? "other",
    active: dto.is_active,
    builtin: dto.is_system,
    _version: dto.version,
  };
}

// ---------- Read hook ----------
export function useOrganizations(): ReadResult<OrgRecord[]> {
  const live = source(KEY) === "live";
  const cell = orgsCell.use();
  const query = useQuery({
    queryKey: organizationKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<OrgDto>("/organizations", { per_page: 100 }, signal).then((r) => {
        const orgs = r.data.map(toOrgRecord);
        orgsCell.set(orgs); // hydrate cell as sync lookup cache (spec §3.4)
        return orgs;
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
  const invalidate = () => qc.invalidateQueries({ queryKey: organizationKeys.lists() });

  const createOrg = useMutation({
    mutationFn: (i: { name: string; metadata: { category: OrgCategory } }) =>
      api.post<OrgDto>("/organizations", i).then(toOrgRecord),
    onSuccess: invalidate,
  });
  const updateOrg = useMutation({
    mutationFn: (i: { id: number; name?: string; metadata?: { category?: OrgCategory } }) =>
      api.patch<OrgDto>(`/organizations/${i.id}`, { name: i.name, metadata: i.metadata }),
    onSuccess: invalidate,
  });
  const toggleOrg = useMutation({
    mutationFn: (i: { id: number; is_active: boolean }) =>
      api.patch(`/organizations/${i.id}`, { is_active: i.is_active }).then(() => undefined),
    onSuccess: invalidate,
  });
  const deleteOrg = useMutation({
    mutationFn: (i: { id: number }) => api.del(`/organizations/${i.id}`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createOrg, updateOrg, toggleOrg, deleteOrg };
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

type AuditInput = {
  userId: string;
  userName: string;
  role: string;
};

export function useOrgMutations(auditCtx?: AuditInput) {
  const live = source(KEY) === "live";
  const liveM = useLiveMutations(); // hooks run every render regardless (stable order)

  function audit(action: string, ref: string, notes?: string) {
    if (auditCtx) {
      logAudit({
        userId: auditCtx.userId,
        userName: auditCtx.userName,
        role: auditCtx.role as Parameters<typeof logAudit>[0]["role"],
        action,
        ref,
        notes,
      });
    }
  }

  if (live) {
    return {
      createOrg: handle(liveM.createOrg),
      updateOrg: handle(liveM.updateOrg),
      toggleOrg: handle(liveM.toggleOrg),
      deleteOrg: handle(liveM.deleteOrg),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createOrg: {
      ...idle,
      mutate: async (i: { name: string; metadata: { category: OrgCategory } }) => {
        const orgs = orgsCell.get();
        let code = i.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
        if (!code) code = `org_${Date.now()}`;
        if (orgs.some((o) => o.code === code)) code = `${code}_${Date.now().toString(36)}`;
        const nextId = Math.max(0, ...orgs.map((o) => o.id)) + 1;
        const record: OrgRecord = {
          id: nextId,
          code,
          label: i.name,
          category: i.metadata.category,
          active: true,
          builtin: false,
        };
        orgsCell.set((prev) => [...prev, record]);
        audit("إضافة جهة", code, i.name);
        return record;
      },
    } as MutationHandle<{ name: string; metadata: { category: OrgCategory } }, OrgRecord>,
    updateOrg: {
      ...idle,
      mutate: async (i: { id: number; name?: string; metadata?: { category?: OrgCategory } }) => {
        orgsCell.set((prev) =>
          prev.map((o) =>
            o.id === i.id
              ? {
                  ...o,
                  ...(i.name !== undefined && { label: i.name }),
                  ...(i.metadata?.category !== undefined && { category: i.metadata.category }),
                }
              : o,
          ),
        );
        const org = orgsCell.get().find((o) => o.id === i.id);
        audit("تعديل جهة", org?.code ?? String(i.id), i.name);
      },
    } as MutationHandle<{ id: number; name?: string; metadata?: { category?: OrgCategory } }>,
    toggleOrg: {
      ...idle,
      mutate: async (i: { id: number; is_active: boolean }) => {
        orgsCell.set((prev) =>
          prev.map((o) => (o.id === i.id ? { ...o, active: i.is_active } : o)),
        );
        const org = orgsCell.get().find((o) => o.id === i.id);
        audit(i.is_active ? "تفعيل جهة" : "إلغاء تفعيل جهة", org?.code ?? String(i.id), org?.label);
      },
    } as MutationHandle<{ id: number; is_active: boolean }>,
    deleteOrg: {
      ...idle,
      mutate: async (i: { id: number }) => {
        const org = orgsCell.get().find((o) => o.id === i.id);
        orgsCell.set((prev) => prev.filter((o) => o.id !== i.id));
        audit("حذف جهة", org?.code ?? String(i.id), org?.label);
      },
    } as MutationHandle<{ id: number }>,
  };
}
