import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { merchantsCell, logAudit } from "@/lib/governance";
import type { Merchant } from "@/lib/mock";

export type { Merchant } from "@/lib/mock";

const KEY = "merchants" as const;

export const merchantKeys = {
  all: [KEY] as const,
  lists: () => [...merchantKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...merchantKeys.lists(), filters ?? {}] as const,
  details: () => [...merchantKeys.all, "detail"] as const,
  detail: (id: number) => [...merchantKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface MerchantDto {
  id: number;
  bank_id: number | null;
  bank_name: string | null;
  name: string;
  commercial_register: string | null;
  tax_number: string | null;
  tax_card_expiry: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  is_active: boolean;
  version?: number;
  created_by: string | null;
  created_at: string | null;
  owners?: { id: number; name: string; ownership_percentage: number }[];
  companies?: {
    id: number;
    name: string;
    commercial_registration_number: string;
    commercial_registration_expiry: string | null;
    sector_reference_value_id: number | null;
    sector_reference_value: { label: string } | null;
    is_active: boolean;
  }[];
}

function toMerchant(dto: MerchantDto): Merchant {
  return {
    id: String(dto.id),
    name: dto.name,
    tax: dto.tax_number ?? "",
    cr: dto.commercial_register ?? "",
    address: dto.address ?? "—",
    contact: dto.phone ?? "—",
    category: "",
    status: dto.status?.toLowerCase() === "suspended" ? "suspended" : "active",
    transactions: 0,
    entityId: dto.bank_id != null ? String(dto.bank_id) : undefined,
    taxCardExpiry: dto.tax_card_expiry ?? undefined,
    commercialRegistrationExpiry: undefined,
    _version: dto.version,
    owners: dto.owners?.map((o) => ({
      id: String(o.id),
      name: o.name,
      share: o.ownership_percentage,
    })),
    linkedCompanies: dto.companies?.map((c) => ({
      id: String(c.id),
      name: c.name,
      category: c.sector_reference_value?.label ?? "",
      cr: c.commercial_registration_number,
      crExpiry: c.commercial_registration_expiry ?? "—",
    })),
  };
}

// ---------- Read hook ----------
export function useMerchants(): ReadResult<Merchant[]> {
  const live = source(KEY) === "live";
  const cell = merchantsCell.use();
  const query = useQuery({
    queryKey: merchantKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<MerchantDto>("/merchants", { per_page: 100 }, signal).then((r) => {
        const merchants = r.data.map(toMerchant);
        merchantsCell.set(merchants);
        return merchants;
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

// ---------- Detail hook (owners + companies) ----------
export function useMerchantDetail(id: number | null): ReadResult<Merchant | null> {
  const live = source(KEY) === "live";
  const cell = merchantsCell.use();

  const query = useQuery({
    queryKey: merchantKeys.detail(id ?? 0),
    enabled: live && id != null,
    queryFn: ({ signal }) =>
      api.get<MerchantDto>(`/merchants/${id}`, undefined, signal).then(toMerchant),
  });

  if (!live) {
    const found = id != null ? (cell.find((m) => m.id === String(id)) ?? null) : null;
    return mockRead(found);
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as ReadResult<unknown>["error"]) ?? null,
    refetch: () => void query.refetch(),
  };
}

// ---------- Mutations ----------
export type OwnerPayload = { name: string; ownership_percentage: number };
export type CompanyPayload = {
  name: string;
  commercial_registration_number: string;
  commercial_registration_expiry?: string;
  sector_reference_value_id?: number;
  is_active?: boolean;
};

export type CreateMerchantInput = {
  name: string;
  bank_id?: number;
  commercial_register?: string;
  tax_number?: string;
  tax_card_expiry?: string;
  phone?: string;
  address?: string;
  status?: string;
  owners?: OwnerPayload[];
  companies?: CompanyPayload[];
};

export type UpdateMerchantInput = {
  id: number;
  name?: string;
  bank_id?: number;
  commercial_register?: string;
  tax_number?: string;
  tax_card_expiry?: string;
  phone?: string;
  address?: string;
  status?: string;
  version?: number;
  owners?: OwnerPayload[];
  companies?: CompanyPayload[];
};

function useLiveMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: merchantKeys.lists() });

  const createMerchant = useMutation({
    mutationFn: (i: CreateMerchantInput) => api.post<MerchantDto>("/merchants", i).then(toMerchant),
    onSuccess: invalidate,
  });
  const updateMerchant = useMutation({
    mutationFn: (i: UpdateMerchantInput) => {
      const { id, ...body } = i;
      return api.patch<MerchantDto>(`/merchants/${id}`, body);
    },
    onSuccess: invalidate,
  });
  const toggleMerchant = useMutation({
    mutationFn: (i: { id: number; activate: boolean }) =>
      api.post(`/merchants/${i.id}/${i.activate ? "activate" : "suspend"}`).then(() => undefined),
    onSuccess: invalidate,
  });
  const deleteMerchant = useMutation({
    mutationFn: (i: { id: number }) => api.del(`/merchants/${i.id}`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createMerchant, updateMerchant, toggleMerchant, deleteMerchant };
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

export function useMerchantMutations(auditCtx?: AuditInput) {
  const live = source(KEY) === "live";
  const liveM = useLiveMutations();

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
      createMerchant: handle(liveM.createMerchant),
      updateMerchant: handle(liveM.updateMerchant),
      toggleMerchant: handle(liveM.toggleMerchant),
      deleteMerchant: handle(liveM.deleteMerchant),
    };
  }

  return {
    createMerchant: {
      ...idle,
      mutate: async (i: CreateMerchantInput) => {
        const merchants = merchantsCell.get();
        const nextId = String(Math.max(0, ...merchants.map((m) => Number(m.id) || 0)) + 1);
        const record: Merchant = {
          id: nextId,
          name: i.name,
          tax: i.tax_number ?? "",
          cr: i.commercial_register ?? "",
          address: i.address ?? "—",
          contact: i.phone ?? "—",
          category: "",
          status: "active",
          transactions: 0,
          entityId: i.bank_id != null ? String(i.bank_id) : undefined,
          taxCardExpiry: i.tax_card_expiry,
        };
        merchantsCell.set((prev) => [record, ...prev]);
        audit("إضافة تاجر جديد", record.cr, i.name);
        return record;
      },
    } as MutationHandle<CreateMerchantInput, Merchant>,
    updateMerchant: {
      ...idle,
      mutate: async (i: UpdateMerchantInput) => {
        merchantsCell.set((prev) =>
          prev.map((m) =>
            m.id === String(i.id)
              ? {
                  ...m,
                  ...(i.name !== undefined && { name: i.name }),
                  ...(i.tax_number !== undefined && { tax: i.tax_number }),
                  ...(i.commercial_register !== undefined && { cr: i.commercial_register }),
                  ...(i.address !== undefined && { address: i.address || "—" }),
                  ...(i.phone !== undefined && { contact: i.phone || "—" }),
                  ...(i.bank_id !== undefined && { entityId: String(i.bank_id) }),
                  ...(i.tax_card_expiry !== undefined && { taxCardExpiry: i.tax_card_expiry }),
                }
              : m,
          ),
        );
        audit("تعديل بيانات تاجر", String(i.id), i.name);
      },
    } as MutationHandle<UpdateMerchantInput>,
    toggleMerchant: {
      ...idle,
      mutate: async (i: { id: number; activate: boolean }) => {
        merchantsCell.set((prev) =>
          prev.map((m) =>
            m.id === String(i.id) ? { ...m, status: i.activate ? "active" : "suspended" } : m,
          ),
        );
        const merchant = merchantsCell.get().find((m) => m.id === String(i.id));
        audit(i.activate ? "تفعيل تاجر" : "إيقاف تاجر", String(i.id), merchant?.name);
      },
    } as MutationHandle<{ id: number; activate: boolean }>,
    deleteMerchant: {
      ...idle,
      mutate: async (i: { id: number }) => {
        const merchant = merchantsCell.get().find((m) => m.id === String(i.id));
        merchantsCell.set((prev) => prev.filter((m) => m.id !== String(i.id)));
        audit("حذف تاجر", String(i.id), merchant?.name);
      },
    } as MutationHandle<{ id: number }>,
  };
}
