// ============================================================
// Teams adapter (spec §6). Exposes a stable hook surface;
// picks mock vs live via source(). DTO<->domain mapping lives
// here, never in the screen. Imports only shared utils
// (http/query/source) + the mock cell — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { teamsCell, orgsCell, logAudit, type TeamRecord } from "@/lib/governance";

// Re-export types for adapter consumers (spec §6)
export type { TeamRecord } from "@/lib/governance";

const KEY = "teams" as const;

// ---------- Query key factory (spec §3.6) ----------
export const teamKeys = {
  all: [KEY] as const,
  lists: () => [...teamKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...teamKeys.lists(), filters ?? {}] as const,
  details: () => [...teamKeys.all, "detail"] as const,
  detail: (id: number) => [...teamKeys.details(), id] as const,
};

// ---------- DTO -> domain ----------
interface TeamDto {
  id: number;
  code: string;
  name: string; // → label
  organization: { id: number; code: string; name: string };
  organization_id: number; // → orgId
  is_active: boolean; // → active
  is_system: boolean; // → builtin
  version?: number; // → _version
}

export function toTeamRecord(dto: TeamDto): TeamRecord {
  return {
    id: dto.id,
    code: dto.code,
    label: dto.name,
    orgId: dto.organization_id,
    orgCode: dto.organization.code,
    roleCode: undefined, // backend has no role_code field (BH-03)
    active: dto.is_active,
    builtin: dto.is_system,
    _version: dto.version,
  };
}

// ---------- Read hook ----------
export function useTeams(): ReadResult<TeamRecord[]> {
  const live = source(KEY) === "live";
  const cell = teamsCell.use();
  const query = useQuery({
    queryKey: teamKeys.list(),
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<TeamDto>("/teams", { per_page: 100 }, signal).then((r) => {
        const teams = r.data.map(toTeamRecord);
        teamsCell.set(teams); // hydrate cell as sync lookup cache (spec §3.4)
        return teams;
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
  const invalidate = () => qc.invalidateQueries({ queryKey: teamKeys.lists() });

  const createTeam = useMutation({
    mutationFn: (i: { name: string; organization_id: number }) =>
      api.post<TeamDto>("/teams", i).then(toTeamRecord),
    onSuccess: invalidate,
  });
  const updateTeam = useMutation({
    mutationFn: (i: { id: number; name?: string; organization_id?: number }) =>
      api.patch<TeamDto>(`/teams/${i.id}`, { name: i.name, organization_id: i.organization_id }),
    onSuccess: invalidate,
  });
  const toggleTeam = useMutation({
    mutationFn: (i: { id: number; is_active: boolean }) =>
      api.patch(`/teams/${i.id}`, { is_active: i.is_active }).then(() => undefined),
    onSuccess: invalidate,
  });
  const deleteTeam = useMutation({
    mutationFn: (i: { id: number }) => api.del(`/teams/${i.id}`).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createTeam, updateTeam, toggleTeam, deleteTeam };
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

export function useTeamMutations(auditCtx?: AuditInput) {
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
      createTeam: handle(liveM.createTeam),
      updateTeam: handle(liveM.updateTeam),
      toggleTeam: handle(liveM.toggleTeam),
      deleteTeam: handle(liveM.deleteTeam),
    };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    createTeam: {
      ...idle,
      mutate: async (i: { name: string; organization_id: number }) => {
        const teams = teamsCell.get();
        let code = i.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
        if (!code) code = `team_${Date.now()}`;
        if (teams.some((t) => t.code === code)) code = `${code}_${Date.now().toString(36)}`;
        const nextId = Math.max(0, ...teams.map((t) => t.id)) + 1;
        const org = orgsCell.get().find((o) => o.id === i.organization_id);
        const record: TeamRecord = {
          id: nextId,
          code,
          label: i.name,
          orgId: i.organization_id,
          orgCode: org?.code ?? "",
          roleCode: undefined,
          active: true,
          builtin: false,
        };
        teamsCell.set((prev) => [...prev, record]);
        audit("إضافة فريق", code, i.name);
        return record;
      },
    } as MutationHandle<{ name: string; organization_id: number }, TeamRecord>,
    updateTeam: {
      ...idle,
      mutate: async (i: { id: number; name?: string; organization_id?: number }) => {
        orgsCell.get(); // ensure cell is read
        teamsCell.set((prev) =>
          prev.map((t) => {
            if (t.id !== i.id) return t;
            const org =
              i.organization_id !== undefined
                ? orgsCell.get().find((o) => o.id === i.organization_id)
                : undefined;
            return {
              ...t,
              ...(i.name !== undefined && { label: i.name }),
              ...(i.organization_id !== undefined && {
                orgId: i.organization_id,
                orgCode: org?.code ?? t.orgCode,
              }),
            };
          }),
        );
        const team = teamsCell.get().find((t) => t.id === i.id);
        audit("تعديل فريق", team?.code ?? String(i.id), i.name);
      },
    } as MutationHandle<{ id: number; name?: string; organization_id?: number }>,
    toggleTeam: {
      ...idle,
      mutate: async (i: { id: number; is_active: boolean }) => {
        teamsCell.set((prev) =>
          prev.map((t) => (t.id === i.id ? { ...t, active: i.is_active } : t)),
        );
        const team = teamsCell.get().find((t) => t.id === i.id);
        audit(
          i.is_active ? "تفعيل فريق" : "إلغاء تفعيل فريق",
          team?.code ?? String(i.id),
          team?.label,
        );
      },
    } as MutationHandle<{ id: number; is_active: boolean }>,
    deleteTeam: {
      ...idle,
      mutate: async (i: { id: number }) => {
        const team = teamsCell.get().find((t) => t.id === i.id);
        teamsCell.set((prev) => prev.filter((t) => t.id !== i.id));
        audit("حذف فريق", team?.code ?? String(i.id), team?.label);
      },
    } as MutationHandle<{ id: number }>,
  };
}
