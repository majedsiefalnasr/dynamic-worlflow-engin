// ============================================================
// Merchants resource. Endpoints: /merchants (+ activate/suspend), detail GET.
//
// The list omits owners/companies; GET /merchants/{id} returns them. So the
// table uses the list and the edit dialog fetches the detail. Category is a
// reference value: stored as sector_reference_value_id, shown/edited as a label,
// so we resolve label <-> id via the sector_activity reference values.
//
// NOTE: activate/suspend POST endpoints return 406 (CR-03) and merchant PATCH
// rejects status/is_active, so the status toggle is currently blocked server-side.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Merchant } from "@/lib/mock";

interface OwnerDto {
  id?: number;
  name: string;
  ownership_percentage: number;
}
interface CompanyDto {
  id?: number;
  name: string;
  commercial_registration_number: string;
  commercial_registration_expiry: string;
  sector_reference_value_id: number | null;
  is_active?: boolean;
}
interface MerchantDto {
  id: number;
  bank_id: number;
  bank_name?: string;
  name: string;
  commercial_register?: string;
  tax_number?: string;
  tax_card_expiry?: string;
  phone?: string;
  address?: string;
  status?: string;
  is_active?: boolean;
  owners?: OwnerDto[];
  companies?: CompanyDto[];
}

export interface SectorValue {
  id: number;
  label: string;
}

const sectorLabel = (id: number | null | undefined, sectors: SectorValue[]): string =>
  sectors.find((s) => s.id === id)?.label ?? "";
const sectorIdOf = (label: string, sectors: SectorValue[]): number | null =>
  sectors.find((s) => s.label === label)?.id ?? null;

function toMerchant(d: MerchantDto, sectors: SectorValue[]): Merchant {
  const companies = (d.companies ?? []).map((c, i) => ({
    id: String(c.id ?? `co_${d.id}_${i}`),
    name: c.name,
    category: sectorLabel(c.sector_reference_value_id, sectors),
    cr: c.commercial_registration_number,
    crExpiry: c.commercial_registration_expiry,
  }));
  const suspended = (d.status ?? "").toUpperCase() === "SUSPENDED" || d.is_active === false;
  return {
    id: String(d.id),
    name: d.name,
    tax: d.tax_number ?? "",
    cr: d.commercial_register ?? companies[0]?.cr ?? "",
    address: d.address ?? "—",
    contact: d.phone ?? "—",
    category: companies[0]?.category ?? "",
    status: suspended ? "suspended" : "active",
    transactions: 0,
    entityId: String(d.bank_id),
    taxCardExpiry: d.tax_card_expiry,
    commercialRegistrationExpiry: companies[0]?.crExpiry,
    owners: (d.owners ?? []).map((o, i) => ({
      id: String(o.id ?? `own_${d.id}_${i}`),
      name: o.name,
      share: o.ownership_percentage,
    })),
    linkedCompanies: companies,
  };
}

function toWriteBody(m: Merchant, sectors: SectorValue[]) {
  const companies = m.linkedCompanies?.length
    ? m.linkedCompanies
    : [
        {
          id: "",
          name: m.name,
          category: m.category,
          cr: m.cr,
          crExpiry: m.commercialRegistrationExpiry ?? "",
        },
      ];
  return {
    bank_id: Number(m.entityId),
    name: m.name,
    tax_number: m.tax,
    commercial_register: m.cr || companies[0]?.cr || undefined,
    tax_card_expiry: m.taxCardExpiry || undefined,
    address: m.address === "—" ? undefined : m.address,
    phone: m.contact === "—" ? undefined : m.contact,
    status: m.status === "active" ? "ACTIVE" : "SUSPENDED",
    owners: (m.owners ?? []).map((o) => ({
      name: o.name,
      ownership_percentage: Number(o.share) || 0,
    })),
    companies: companies.map((c) => ({
      name: c.name,
      commercial_registration_number: c.cr,
      commercial_registration_expiry: c.crExpiry,
      sector_reference_value_id: sectorIdOf(c.category, sectors),
      is_active: true,
    })),
  };
}

export const merchantKeys = {
  all: ["merchants"] as const,
  list: () => [...merchantKeys.all, "list"] as const,
};

/** Sector values from the `sector_activity` reference table — drives the category dropdown + id resolution. */
export function useSectorValues(enabled: boolean) {
  return useQuery({
    queryKey: ["reference-tables", "sector_activity", "values"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<{
          key: string;
          values?: { id: number; label: string }[];
        }>("/reference-tables", { per_page: 100 }, signal)
        .then((r) => {
          const table = r.data.find((t) => t.key === "sector_activity");
          return (table?.values ?? []).map((v) => ({ id: v.id, label: v.label }) as SectorValue);
        }),
  });
}

export function useMerchantsQuery(enabled: boolean) {
  return useQuery({
    queryKey: merchantKeys.list(),
    enabled,
    // List omits owners/companies; map with empty sectors (category resolves in the detail view).
    queryFn: ({ signal }) =>
      api
        .getList<MerchantDto>("/merchants", { per_page: 100 }, signal)
        .then((r) => r.data.map((d) => toMerchant(d, []))),
  });
}

/** Full merchant (owners + companies) for the edit dialog. */
export function fetchMerchantDetail(id: string, sectors: SectorValue[]): Promise<Merchant> {
  return api.get<MerchantDto>(`/merchants/${id}`).then((d) => toMerchant(d, sectors));
}

export function useMerchantMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: merchantKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: { merchant: Merchant; sectors: SectorValue[] }) =>
        api.post("/merchants", toWriteBody(input.merchant, input.sectors)),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; merchant: Merchant; sectors: SectorValue[] }) =>
        api.patch(`/merchants/${input.id}`, toWriteBody(input.merchant, input.sectors)),
      onSuccess: invalidate,
    }),
    // Blocked server-side (CR-03) — kept so it works once the 406 is fixed.
    setStatus: useMutation({
      mutationFn: (input: { id: string; suspend: boolean }) =>
        api.post(`/merchants/${input.id}/${input.suspend ? "suspend" : "activate"}`),
      onSuccess: invalidate,
    }),
  };
}
