// ============================================================
// Audit logs (read-only). GET /audit-logs.
// Row shape is mapped defensively (the endpoint was empty at wiring time, so
// fields like the actor name are best-effort) — verify once requests/audit are
// seeded, then tighten the mapping.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { AuditEntry } from "@/lib/governance";
import type { RoleId } from "@/lib/mock";

interface AuditDto {
  id: number;
  actor_user_id?: number;
  actor?: { id: number; name?: string } | null;
  actor_name?: string;
  event_code?: string;
  entity_type?: string;
  entity_id?: number;
  request_id?: number;
  metadata?: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
}

function toAuditEntry(d: AuditDto): AuditEntry {
  const ref =
    (d.metadata?.reference as string | undefined) ??
    (d.request_id != null
      ? String(d.request_id)
      : d.entity_id != null
        ? `${d.entity_type ?? ""}#${d.entity_id}`
        : "—");
  return {
    id: String(d.id),
    userId: d.actor_user_id != null ? String(d.actor_user_id) : "",
    userName:
      d.actor?.name ?? d.actor_name ?? (d.actor_user_id != null ? `#${d.actor_user_id}` : "—"),
    role: "" as RoleId,
    action: d.event_code ?? "—",
    ts: d.created_at ?? new Date().toISOString(),
    ip: d.ip_address ?? "—",
    device: d.user_agent ?? "—",
    ref,
  };
}

export function useAuditLogsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["audit-logs"],
    enabled,
    queryFn: ({ signal }) =>
      api
        .getList<AuditDto>("/audit-logs", { per_page: 100 }, signal)
        .then((r) => r.data.map(toAuditEntry)),
  });
}
