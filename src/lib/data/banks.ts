// ============================================================
// Banks adapter (spec §6). Exposes a stable hook surface;
// picks mock vs live via source(). DTO<->domain mapping lives
// here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { entitiesCell, logAudit } from "@/lib/governance";
import type { BankEntity } from "@/lib/mock";

// Re-export types for adapter consumers (spec §6)
export type { BankEntity } from "@/lib/mock";

const KEY = "banks" as const;

// ---------- Query key factory (spec §3.6) ----------
export const bankKeys = {
  all: [KEY] as const,
  lists: () => [...bankKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...bankKeys.lists(), filters ?? {}] as const,
  details: () => [...bankKeys.all, "detail"] as const,
  detail: (id: number) => [...bankKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface BankDto {
  id: number;
  code: string;
  name: string;
  license_number?: string;
  swift_code?: string;
  status: string;
  version?: number;
  is_active?: boolean;
}

export function toBankEntity(dto: BankDto): BankEntity {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    licenseNumber: dto.license_number,
    swiftCode: dto.swift_code,
    status:
      ((dto.status?.toLowerCase() as BankEntity["status"]) ?? (dto.is_active === false ? "inactive" : "active")),
    _version: dto.version,
  };
}

// ---------- Read hook ----------
export function useBanks(): ReadResult<BankEntity[]> {
  const live = source(KEY) === "live";
  const cell = entitiesCell.use();
  const query = useQuery({
    queryKey: bankKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<BankDto>("/banks", { per_page: 100 }, signal).then((r) => {
        const banks = r.data.map(toBankEntity);
        entitiesCell.set(banks); // hydrate cell as sync lookup cache (spec §3.4)
        return banks;
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
  const invalidate = () => qc.invalidateQueries({ queryKey: bankKeys.lists() });

  const createBank = useMutation({
    mutationFn: (i: {
      name: string;
      code?: string;
      license_number?: string;
      swift_code?: string;
    }) => api.post<BankDto>("/banks", i).then(toBankEntity),
    onSuccess: invalidate,
  });
  const updateBank = useMutation({
    mutationFn: (i: { id: number; name?: string; license_number?: string; swift_code?: string; version?: number }) =>
      api.patch<BankDto>(`/banks/${i.id}`, i),
    onSuccess: invalidate,
  });
  const toggleBank = useMutation({
    mutationFn: (i: { id: number; activate: boolean }) =>
      api.post(`/banks/${i.id}/${i.activate ? "activate" : "deactivate"}`).then(() => undefined),
    onSuccess: invalidate,
  });
  const deleteBank = useMutation({
    mutationFn: (i: { id: number }) => api.del(`/banks/${i.id}`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createBank, updateBank, toggleBank, deleteBank };
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

export function useBankMutations(auditCtx?: AuditInput) {
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
      createBank: handle(liveM.createBank),
      updateBank: handle(liveM.updateBank),
      toggleBank: handle(liveM.toggleBank),
      deleteBank: handle(liveM.deleteBank),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createBank: {
      ...idle,
      mutate: async (i: {
        name: string;
        code?: string;
        license_number?: string;
        swift_code?: string;
      }) => {
        const banks = entitiesCell.get();
        let code =
          i.code ??
          i.name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
        if (!code) code = `bank_${Date.now()}`;
        if (banks.some((b) => b.code === code)) code = `${code}_${Date.now().toString(36)}`;
        const nextId = Math.max(0, ...banks.map((b) => b.id)) + 1;
        const record: BankEntity = {
          id: nextId,
          code,
          name: i.name,
          licenseNumber: i.license_number,
          swiftCode: i.swift_code,
          status: "active",
        };
        entitiesCell.set((prev) => [...prev, record]);
        audit("إضافة بنك جديد", code, i.name);
        return record;
      },
    } as MutationHandle<
      { name: string; code?: string; license_number?: string; swift_code?: string },
      BankEntity
    >,
    updateBank: {
      ...idle,
      mutate: async (i: {
        id: number;
        name?: string;
        license_number?: string;
        swift_code?: string;
      }) => {
        entitiesCell.set((prev) =>
          prev.map((b) =>
            b.id === i.id
              ? {
                  ...b,
                  ...(i.name !== undefined && { name: i.name }),
                  ...(i.license_number !== undefined && { licenseNumber: i.license_number }),
                  ...(i.swift_code !== undefined && { swiftCode: i.swift_code }),
                }
              : b,
          ),
        );
        const bank = entitiesCell.get().find((b) => b.id === i.id);
        audit("تعديل بيانات بنك", bank?.code ?? String(i.id), i.name);
      },
    } as MutationHandle<{
      id: number;
      name?: string;
      license_number?: string;
      swift_code?: string;
    }>,
    toggleBank: {
      ...idle,
      mutate: async (i: { id: number; activate: boolean }) => {
        entitiesCell.set((prev) =>
          prev.map((b) =>
            b.id === i.id ? { ...b, status: i.activate ? "active" : "inactive" } : b,
          ),
        );
        const bank = entitiesCell.get().find((b) => b.id === i.id);
        audit(
          i.activate ? "تفعيل بنك" : "إلغاء تفعيل بنك",
          bank?.code ?? String(i.id),
          bank?.name,
        );
      },
    } as MutationHandle<{ id: number; activate: boolean }>,
    deleteBank: {
      ...idle,
      mutate: async (i: { id: number }) => {
        const bank = entitiesCell.get().find((b) => b.id === i.id);
        entitiesCell.set((prev) => prev.filter((b) => b.id !== i.id));
        audit("حذف بنك", bank?.code ?? String(i.id), bank?.name);
      },
    } as MutationHandle<{ id: number }>,
  };
}
