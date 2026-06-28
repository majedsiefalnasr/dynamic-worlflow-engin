// ============================================================
// Roles adapter (spec §6). Exposes a stable hook surface;
// picks mock vs live via source(). DTO<->domain mapping lives
// here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { roleCatalogCell, orgsCell, logAudit, type RoleCatalogEntry } from "@/lib/governance";

// Re-export types for adapter consumers (spec §6)
export type { RoleCatalogEntry } from "@/lib/governance";

const KEY = "roles" as const;

// ---------- Query key factory (spec §3.6) ----------
export const roleKeys = {
  all: [KEY] as const,
  lists: () => [...roleKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...roleKeys.lists(), filters ?? {}] as const,
  details: () => [...roleKeys.all, "detail"] as const,
  detail: (id: number) => [...roleKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface RoleDto {
  id: number;
  code: string;
  name: string;
  organization: { id: number; code: string; name: string };
  organization_id: number; // → orgId
  is_active: boolean; // → active
  is_system: boolean; // → builtin
  version?: number; // → _version
}

export function toRoleCatalogEntry(dto: RoleDto): RoleCatalogEntry {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    orgId: dto.organization_id,
    orgCode: dto.organization.code,
    active: dto.is_active,
    builtin: dto.is_system,
    _version: dto.version,
  };
}

// ---------- Read hook ----------
export function useRoles(): ReadResult<RoleCatalogEntry[]> {
  const live = source(KEY) === "live";
  const cell = roleCatalogCell.use();
  const query = useQuery({
    queryKey: roleKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<RoleDto>("/roles", { per_page: 100 }, signal).then((r) => {
        const roles = r.data.map(toRoleCatalogEntry);
        roleCatalogCell.set(roles); // hydrate cell as sync lookup cache (spec §3.4)
        return roles;
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
  const invalidate = () => qc.invalidateQueries({ queryKey: roleKeys.lists() });

  const createRole = useMutation({
    mutationFn: (i: { name: string; organization_id: number }) =>
      api.post<RoleDto>("/roles", i).then(toRoleCatalogEntry),
    onSuccess: invalidate,
  });
  const updateRole = useMutation({
    mutationFn: (i: { id: number; name?: string; organization_id?: number; version?: number }) =>
      api.patch<RoleDto>(`/roles/${i.id}`, { name: i.name, organization_id: i.organization_id, version: i.version }),
    onSuccess: invalidate,
  });
  const toggleRole = useMutation({
    mutationFn: (i: { id: number; activate: boolean }) =>
      api.post(`/roles/${i.id}/${i.activate ? "activate" : "deactivate"}`).then(() => undefined),
    onSuccess: invalidate,
  });
  const deleteRole = useMutation({
    mutationFn: (i: { id: number }) => api.del(`/roles/${i.id}`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createRole, updateRole, toggleRole, deleteRole };
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

export function useRoleMutations(auditCtx?: AuditInput) {
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
      createRole: handle(liveM.createRole),
      updateRole: handle(liveM.updateRole),
      toggleRole: handle(liveM.toggleRole),
      deleteRole: handle(liveM.deleteRole),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createRole: {
      ...idle,
      mutate: async (i: { name: string; organization_id: number }) => {
        const roles = roleCatalogCell.get();
        const code = `rc_${Date.now()}`;
        const nextId = Math.max(0, ...roles.map((r) => r.id)) + 1;
        const org = orgsCell.get().find((o) => o.id === i.organization_id);
        const record: RoleCatalogEntry = {
          id: nextId,
          code,
          name: i.name,
          orgId: i.organization_id,
          orgCode: org?.code ?? "",
          active: true,
          builtin: false,
        };
        roleCatalogCell.set((prev) => [...prev, record]);
        audit("إضافة دور", code, i.name);
        return record;
      },
    } as MutationHandle<{ name: string; organization_id: number }, RoleCatalogEntry>,
    updateRole: {
      ...idle,
      mutate: async (i: { id: number; name?: string; organization_id?: number }) => {
        orgsCell.get(); // ensure cell is read
        roleCatalogCell.set((prev) =>
          prev.map((r) => {
            if (r.id !== i.id) return r;
            const org =
              i.organization_id !== undefined
                ? orgsCell.get().find((o) => o.id === i.organization_id)
                : undefined;
            return {
              ...r,
              ...(i.name !== undefined && { name: i.name }),
              ...(i.organization_id !== undefined && {
                orgId: i.organization_id,
                orgCode: org?.code ?? r.orgCode,
              }),
            };
          }),
        );
        const role = roleCatalogCell.get().find((r) => r.id === i.id);
        audit("تعديل دور", role?.code ?? String(i.id), i.name);
      },
    } as MutationHandle<{ id: number; name?: string; organization_id?: number }>,
    toggleRole: {
      ...idle,
      mutate: async (i: { id: number; activate: boolean }) => {
        roleCatalogCell.set((prev) =>
          prev.map((r) => (r.id === i.id ? { ...r, active: i.activate } : r)),
        );
        const role = roleCatalogCell.get().find((r) => r.id === i.id);
        audit(
          i.activate ? "تفعيل دور" : "إلغاء تفعيل دور",
          role?.code ?? String(i.id),
          role?.name,
        );
      },
    } as MutationHandle<{ id: number; activate: boolean }>,
    deleteRole: {
      ...idle,
      mutate: async (i: { id: number }) => {
        const role = roleCatalogCell.get().find((r) => r.id === i.id);
        roleCatalogCell.set((prev) => prev.filter((r) => r.id !== i.id));
        audit("حذف دور", role?.code ?? String(i.id), role?.name);
      },
    } as MutationHandle<{ id: number }>,
  };
}
