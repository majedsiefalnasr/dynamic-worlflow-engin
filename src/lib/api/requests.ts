// ============================================================
// Requests (runtime) — read. GET /requests (permission-scoped), plus the
// workflow version's stages for labels/progress. Maps the backend request onto
// the engine's WorkflowInstance shape so the existing list helpers keep working.
//
// Create / actions / draft / documents are a later slice (need the workflow
// config + a create form); the list + stage labels are wired here.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { WorkflowInstance, WorkflowStage } from "@/lib/workflow-engine";

interface RequestDto {
  id: number;
  reference_number?: string | null;
  workflow_version_id?: number;
  current_stage_id?: number;
  current_stage?: { id?: number; name?: string } | null;
  status?: string;
  bank_id?: number;
  bank_name?: string;
  merchant_id?: number;
  merchant_name?: string;
  amount?: number;
  currency?: string;
  invoice_number?: string;
  import_type?: string | null;
  supplier_name?: string | null;
  data?: Record<string, unknown> | null;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

function toInstance(d: RequestDto): WorkflowInstance {
  const data: Record<string, unknown> = { ...(d.data ?? {}) };
  // Hoist the flat list fields into `data` so the list display helpers find them.
  if (d.reference_number) data.requestIdentifier = d.reference_number;
  if (data.invoiceNumber == null && d.invoice_number != null) data.invoiceNumber = d.invoice_number;
  if (data.financeAmount == null && d.amount != null) data.financeAmount = d.amount;
  if (data.currency == null && d.currency != null) data.currency = d.currency;
  if (data.importType == null && d.import_type) data.importType = d.import_type;
  if (data.supplierName == null && d.supplier_name) data.supplierName = d.supplier_name;
  // Applicant name isn't in the list row yet (only bank) — see CR to enrich /requests.
  if (data.importerName == null && d.merchant_name) data.importerName = d.merchant_name;
  return {
    id: String(d.id),
    workflowVersionId: String(d.workflow_version_id ?? ""),
    currentStageId: String(d.current_stage_id ?? d.current_stage?.id ?? ""),
    status: (d.status ?? "").toLowerCase() as WorkflowInstance["status"],
    data,
    createdBy: String(d.created_by ?? ""),
    createdAt: d.created_at ?? "",
    updatedAt: d.updated_at ?? d.created_at ?? "",
  };
}

export function useRequestsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "list"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<RequestDto>("/requests", { per_page: 100 }, signal)
        .then((r) => r.data.map(toInstance)),
  });
}

interface StageDto {
  id: number;
  code: string;
  name: string;
  sort_order?: number;
  is_initial?: boolean;
  is_final?: boolean;
}

function toStage(d: StageDto, versionId: string): WorkflowStage {
  return {
    id: String(d.id),
    workflowVersionId: versionId,
    code: d.code,
    name: d.name,
    order: d.sort_order ?? 0,
    isInitial: d.is_initial,
    isFinal: d.is_final,
  };
}

/** Stages of a published workflow version — for stage labels, the filter, and progress. */
export function useWorkflowStagesQuery(versionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["workflow-version", versionId, "stages"],
    enabled: enabled && !!versionId,
    queryFn: ({ signal }) =>
      api
        .getList<StageDto>(`/workflow-versions/${versionId}/stages`, { per_page: 100 }, signal)
        .then((r) => r.data.map((d) => toStage(d, versionId as string))),
  });
}
