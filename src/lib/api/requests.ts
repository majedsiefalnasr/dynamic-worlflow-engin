// ============================================================
// Requests (runtime) — read. GET /requests (permission-scoped), plus the
// workflow version's stages for labels/progress. Maps the backend request onto
// the engine's WorkflowInstance shape so the existing list helpers keep working.
//
// Create / actions / draft / documents are a later slice (need the workflow
// config + a create form); the list + stage labels are wired here.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { WorkflowInstance, WorkflowHistory, WorkflowStage } from "@/lib/workflow-engine";

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
  if (d.reference_number && d.reference_number !== "NULL") data.requestIdentifier = d.reference_number;
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

// ============================================================
// Detail query — single request with extra fields
// ============================================================

interface RequestDetailDto extends RequestDto {
  merchant?: { id: number; name: string; commercial_register?: string } | null;
  goods_description?: string | null;
  port_of_entry?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  expected_arrival_date?: string | null;
  country_of_origin?: string | null;
  invoice_date?: string | null;
  shipping_port?: string | null;
  bill_of_lading_number?: string | null;
  version?: number;
  documents?: {
    id: number;
    type?: string;
    original_filename?: string;
    mime_type?: string;
    size_bytes?: number;
    uploaded_by?: number;
    uploaded_by_name?: string | null;
    uploaded_at?: string;
    download_url?: string;
  }[];
}

function toDetailInstance(d: RequestDetailDto): WorkflowInstance & { _version: number; _merchantName: string } {
  const base = toInstance(d);
  if (d.merchant?.name && !base.data.importerName) base.data.importerName = d.merchant.name;
  return {
    ...base,
    _version: d.version ?? 0,
    _merchantName: d.merchant?.name ?? "",
  };
}

export function useRequestDetailQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "detail", id],
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api.get<RequestDetailDto>(`/requests/${id}`, undefined, signal).then(toDetailInstance),
  });
}

// ============================================================
// History query — transition log for a request
// ============================================================

interface HistoryDto {
  id?: number;
  request_id: number;
  from_stage_id: number | null;
  to_stage_id: number | null;
  action_id?: number | null;
  transition_id?: number | null;
  performed_by: number;
  comment?: string | null;
  data_snapshot?: Record<string, unknown> | null;
  created_at?: string;
}

function toHistory(d: HistoryDto): WorkflowHistory {
  return {
    id: String(d.id ?? d.request_id),
    workflowInstanceId: String(d.request_id),
    fromStageId: d.from_stage_id != null ? String(d.from_stage_id) : null,
    toStageId: String(d.to_stage_id ?? ""),
    actionCode: String(d.action_id ?? ""),
    actionName: "",
    performedBy: String(d.performed_by),
    comments: d.comment ?? undefined,
    timestamp: d.created_at ?? "",
  };
}

export function useRequestHistoryQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "history", id],
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api.get<HistoryDto[]>(`/requests/${id}/history`, undefined, signal)
        .then((arr) => (Array.isArray(arr) ? arr : []).map(toHistory)),
  });
}

// ============================================================
// Mutations — create, save draft, execute action
// ============================================================

export function useRequestMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ["requests"] });
  return {
    create: useMutation({
      mutationFn: (input: {
        workflowVersionId: number;
        bankId: number;
        merchantId: number;
        amount?: number;
        currency?: string;
        invoiceNumber?: string;
        data?: Record<string, unknown>;
      }) =>
        api.post<RequestDetailDto>("/requests", {
          workflow_version_id: input.workflowVersionId,
          bank_id: input.bankId,
          merchant_id: input.merchantId,
          amount: input.amount,
          currency: input.currency,
          invoice_number: input.invoiceNumber,
          data: input.data,
        }),
      onSuccess: invalidateList,
    }),
    saveDraft: useMutation({
      mutationFn: (input: {
        id: string;
        version: number;
        data?: Record<string, unknown>;
        amount?: number;
        currency?: string;
        invoiceNumber?: string;
      }) =>
        api.patch(`/requests/${input.id}/draft`, {
          version: input.version,
          data: input.data,
          amount: input.amount,
          currency: input.currency,
          invoice_number: input.invoiceNumber,
        }),
      onSuccess: invalidateList,
    }),
    executeAction: useMutation({
      mutationFn: (input: {
        id: string;
        transitionId: number;
        version: number;
        comment?: string;
        data?: Record<string, unknown>;
      }) =>
        api.post(`/requests/${input.id}/actions`, {
          transition_id: input.transitionId,
          version: input.version,
          comment: input.comment,
          data: input.data,
        }),
      onSuccess: invalidateList,
    }),
  };
}
