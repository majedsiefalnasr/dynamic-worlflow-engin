// ============================================================
// Users adapter (spec §6). Exposes a stable hook surface;
// picks mock vs live via source(). DTO<->domain mapping reuses
// toUser from auth.ts. Imports only shared utils
// (http/query/source) + mock helpers — never a peer adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import { toUser } from "./auth";
import {
  DEMO_USERS,
  saveUsers,
  computeAvatar,
  getRoleLabel,
  type User,
  type RoleId,
} from "@/lib/mock";
import { logAudit } from "@/lib/governance";
import { upsertWorkflowUser } from "@/lib/workflow-bridge";

export type { User } from "@/lib/mock";

const KEY = "users" as const;

// ---------- Query key factory (spec §3.6) ----------
export const userKeys = {
  all: [KEY] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...userKeys.lists(), filters ?? {}] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: number) => [...userKeys.details(), id] as const,
};

// ---------- DTO type (reuses toUser from auth) ----------
interface UserDto {
  id: number;
  version?: number;
  name: string;
  email: string;
  role_id: number | null;
  role: { id: number; code: string; name: string } | null;
  role_label: string | null;
  organization: { id: number; code: string; name: string } | null;
  team: { id: number; code: string; name: string } | null;
  bank_id: number | null;
  bank_name: string | null;
  bank: { id: number; code: string; name: string } | null;
  is_active: boolean;
  screen_permissions: { screen: string; capabilities: string[] }[];
  capabilities: string[];
  created_at: string | null;
  updated_at: string | null;
}

// ---------- Read hook ----------
export function useUsers(filters?: {
  bankId?: number;
  roleCode?: string;
  search?: string;
}): ReadResult<User[]> {
  const live = source(KEY) === "live";

  const query = useQuery({
    queryKey: userKeys.list(filters as Record<string, unknown> | undefined),
    enabled: live,
    queryFn: ({ signal }) => {
      const params: Record<string, string | number> = { per_page: 100 };
      if (filters?.bankId !== undefined) params.bank_id = filters.bankId;
      if (filters?.roleCode) params.role_code = filters.roleCode;
      if (filters?.search) params.search = filters.search;
      return api.getList<UserDto>("/users", params, signal).then((r) => r.data.map(toUser));
    },
  });

  if (!live) {
    let users = [...DEMO_USERS];
    if (filters?.bankId !== undefined) {
      users = users.filter((u) => u.bankId === filters.bankId);
    }
    if (filters?.roleCode) {
      users = users.filter((u) => u.roleId === filters.roleCode);
    }
    if (filters?.search) {
      const s = filters.search.trim().toLowerCase();
      if (s) {
        users = users.filter(
          (u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s),
        );
      }
    }
    return mockRead(users);
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: (query.error as ReadResult<unknown>["error"]) ?? null,
    refetch: () => void query.refetch(),
  };
}

// ---------- Input types ----------
export type CreateUserInput = {
  name: string;
  email: string;
  phone?: string;
  roleId: RoleId;
  organizationCode: string;
  teamCode?: string;
  bankId?: number | null;
  /** Resolved objects for mock mode (screen passes these from its local state) */
  _mock?: {
    organization: { id: number; code: string; name: string } | null;
    team: { id: number; code: string; name: string } | null;
    bank: { id: number; code: string; name: string } | null;
    roleLabel?: string;
  };
};

export type UpdateUserInput = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  roleId: RoleId;
  teamCode?: string;
  /** Resolved objects for mock mode */
  _mock?: {
    team: { id: number; code: string; name: string } | null;
    roleLabel?: string;
  };
};

export type ToggleUserInput = {
  id: number;
  isActive: boolean;
};

// ---------- Mutations ----------
function useLiveMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: userKeys.lists() });

  const createUser = useMutation({
    mutationFn: (i: CreateUserInput) =>
      api
        .post<UserDto>("/users", {
          name: i.name,
          email: i.email,
          phone: i.phone,
          role_id: i.roleId,
          organization_code: i.organizationCode,
          team_code: i.teamCode,
          bank_id: i.bankId,
        })
        .then(toUser),
    onSuccess: invalidate,
  });
  const updateUser = useMutation({
    mutationFn: (i: UpdateUserInput) =>
      api
        .patch<UserDto>(`/users/${i.id}`, {
          name: i.name,
          email: i.email,
          phone: i.phone,
          role_id: i.roleId,
          team_code: i.teamCode,
        })
        .then(toUser),
    onSuccess: invalidate,
  });
  const toggleUser = useMutation({
    mutationFn: (i: ToggleUserInput) =>
      api.patch(`/users/${i.id}`, { is_active: i.isActive }).then(() => undefined),
    onSuccess: invalidate,
  });
  return { createUser, updateUser, toggleUser };
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

export function useUserMutations(auditCtx?: AuditInput) {
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
      createUser: handle(liveM.createUser),
      updateUser: handle(liveM.updateUser),
      toggleUser: handle(liveM.toggleUser),
    };
  }

  // Mock: write the array synchronously, resolve immediately (spec §3.2).
  return {
    createUser: {
      ...idle,
      mutate: async (i: CreateUserInput) => {
        const newUser: User = {
          id: Date.now(),
          name: i.name,
          email: i.email,
          phone: i.phone,
          roleId: i.roleId,
          roleLabel: i._mock?.roleLabel ?? getRoleLabel(i.roleId),
          role: null,
          organization: i._mock?.organization ?? null,
          team: i._mock?.team ?? null,
          bank: i._mock?.bank ?? null,
          bankId: i.bankId ?? null,
          isActive: true,
          avatar: computeAvatar(i.name),
          screenPermissions: [],
          capabilities: [],
        };
        DEMO_USERS.push(newUser);
        saveUsers();
        upsertWorkflowUser(newUser);
        audit("إضافة مستخدم نظام", newUser.email, newUser.name);
        return newUser;
      },
    } as MutationHandle<CreateUserInput, User>,
    updateUser: {
      ...idle,
      mutate: async (i: UpdateUserInput) => {
        const idx = DEMO_USERS.findIndex((u) => u.id === i.id);
        if (idx < 0) return;
        DEMO_USERS[idx] = {
          ...DEMO_USERS[idx],
          name: i.name,
          email: i.email,
          phone: i.phone,
          roleId: i.roleId,
          roleLabel: i._mock?.roleLabel ?? getRoleLabel(i.roleId),
          team: i._mock?.team ?? DEMO_USERS[idx].team,
          avatar: computeAvatar(i.name),
        };
        saveUsers();
        upsertWorkflowUser(DEMO_USERS[idx]);
        audit("تعديل بيانات مستخدم", i.email, i.name);
      },
    } as MutationHandle<UpdateUserInput>,
    toggleUser: {
      ...idle,
      mutate: async (i: ToggleUserInput) => {
        const idx = DEMO_USERS.findIndex((u) => u.id === i.id);
        if (idx < 0) return;
        DEMO_USERS[idx] = { ...DEMO_USERS[idx], isActive: i.isActive };
        saveUsers();
        const u = DEMO_USERS[idx];
        audit(i.isActive ? "تفعيل مستخدم" : "إلغاء تفعيل مستخدم", u.email, u.name);
      },
    } as MutationHandle<ToggleUserInput>,
  };
}
