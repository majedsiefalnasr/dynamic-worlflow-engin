// ============================================================
// Reports resource (read-only aggregates). Verified shape: /reports/summary.
// Chart series (requests-over-time, by-sector, by-currency, …) exist but their
// row shapes are unverified until the backend has seeded requests — wire those
// once real data exists.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface ReportSummary {
  total: number;
  active: number;
  closed: number;
  rejected: number;
  overdue: number;
}

interface SummaryDto {
  total_requests?: number;
  active_requests?: number;
  closed_requests?: number;
  rejected_requests?: number;
  overdue_requests?: number;
}

export function useReportSummary(enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "summary"],
    enabled,
    queryFn: ({ signal }) =>
      api.get<SummaryDto>("/reports/summary", undefined, signal).then(
        (d): ReportSummary => ({
          total: d.total_requests ?? 0,
          active: d.active_requests ?? 0,
          closed: d.closed_requests ?? 0,
          rejected: d.rejected_requests ?? 0,
          overdue: d.overdue_requests ?? 0,
        }),
      ),
  });
}

export interface ChartPoint {
  label: string;
  value: number;
}

/** Requests over time: backend rows are `{ day, total }`. */
export function useRequestsOverTime(enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "over-time"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .get<{ day?: string; total?: number }[]>("/reports/requests-over-time", undefined, signal)
        .then((rows): ChartPoint[] =>
          (rows ?? []).map((r) => ({ label: r.day ?? "", value: r.total ?? 0 })),
        ),
  });
}

/** Requests by currency: backend rows are `{ currency, total }` (counts). */
export function useReportByCurrency(enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "by-currency"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .get<{ currency?: string; total?: number }[]>("/reports/by-currency", undefined, signal)
        .then((rows): ChartPoint[] =>
          (rows ?? []).map((r) => ({ label: r.currency ?? "—", value: r.total ?? 0 })),
        ),
  });
}

/** Requests by sector: backend rows are `{ sector_reference_value_id, total }`; resolve to a label. */
export function useReportBySector(enabled: boolean, sectors: { id: number; label: string }[]) {
  return useQuery({
    queryKey: ["reports", "by-sector", sectors.length],
    enabled,
    queryFn: ({ signal }) =>
      api
        .get<
          { sector_reference_value_id?: number; total?: number }[]
        >("/reports/by-sector", undefined, signal)
        .then((rows): ChartPoint[] =>
          (rows ?? []).map((r) => ({
            label:
              sectors.find((s) => s.id === r.sector_reference_value_id)?.label ??
              `#${r.sector_reference_value_id}`,
            value: r.total ?? 0,
          })),
        ),
  });
}
