// ============================================================
// Screen-permissions adapter (spec §6). Exposes a stable hook
// surface; picks mock vs live via source(). Imports only shared
// utils (http/query/source) + governance cells — never a peer
// adapter (§3.5).
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./http";
import { source } from "./source";
import { mockRead, type MutationHandle, type ReadResult } from "./query";
import {
  screenPermsCell,
  roleCatalogCell,
  MANAGED_SCREENS,
  SCREEN_CAP_LABELS,
  manualScreenCan,
  setScreenPermission,
  logAudit,
  type ManualScreenKey,
  type ScreenCapability,
  type RoleCatalogEntry,
} from "@/lib/governance";
import type { RoleId } from "@/lib/mock";

const KEY = "screen-permissions" as const;

// ---------- Query key factory (spec §3.6) ----------
export const screenPermKeys = {
  all: [KEY] as const,
  matrix: () => [...screenPermKeys.all, "matrix"] as const,
};

// ---------- Types ----------

export type PermissionMatrixData = {
  roles: { id: number; code: string; name: string; orgCode: string }[];
  screens: { key: string; label: string; caps: ScreenCapability[] }[];
  permissions: Record<string, Record<string, ScreenCapability[]>>;
  // permissions[roleCode][screenKey] = ["view", "add", ...]
};

export type ToggleInput = {
  screen: ManualScreenKey;
  roleCode: RoleId;
  cap: ScreenCapability;
  enabled: boolean;
  screenLabel: string;
  roleName: string;
};

// Re-export types for adapter consumers (spec §6)
export type { ManualScreenKey, ScreenCapability, RoleCatalogEntry } from "@/lib/governance";

// ---------- DTO ----------
// Backend capability enum (App\Http\Controllers\Api\RolePermissionController::CAPABILITIES)
// vs. the 3 caps this screen manages. MANAGE implies all of them.
const CAP_TO_BACKEND: Record<ScreenCapability, string> = {
  view: "VIEW",
  add: "CREATE",
  edit: "UPDATE",
};
const BACKEND_TO_CAP: Record<string, ScreenCapability | undefined> = {
  VIEW: "view",
  CREATE: "add",
  UPDATE: "edit",
};

interface PermissionMatrixDto {
  roles: { id: number; code: string; name: string; organization_id: number }[];
  screens: { id: number; code: string; name: string }[];
  permissions: Record<string, Record<string, string[]>>;
}

// Role catalog cell is hydrated here too (not just by the roles adapter) so
// this screen works as a direct-navigation entry point in live mode — the
// shared cell is fine to touch, but roles.ts itself stays off-limits (§3.5).
interface RoleDto {
  id: number;
  code: string;
  name: string;
  organization: { id: number; code: string; name: string };
  organization_id: number;
  is_active: boolean;
  is_system: boolean;
  version?: number;
}

function toRoleCatalogEntry(dto: RoleDto): RoleCatalogEntry {
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

function toPermissions(
  dto: PermissionMatrixDto,
): Record<string, Record<string, ScreenCapability[]>> {
  const roleById = new Map(dto.roles.map((r) => [r.id, r]));
  const permissions: Record<string, Record<string, ScreenCapability[]>> = {};

  for (const [roleId, screenCaps] of Object.entries(dto.permissions)) {
    const role = roleById.get(Number(roleId));
    if (!role) continue;
    permissions[role.code] = {};
    for (const [screenCode, caps] of Object.entries(screenCaps)) {
      const mapped = new Set<ScreenCapability>();
      for (const cap of caps) {
        if (cap === "MANAGE") {
          mapped.add("view");
          mapped.add("add");
          mapped.add("edit");
        } else {
          const c = BACKEND_TO_CAP[cap];
          if (c) mapped.add(c);
        }
      }
      if (mapped.size > 0) permissions[role.code][screenCode] = [...mapped];
    }
  }

  return permissions;
}

// ---------- Read hook ----------
export function usePermissionMatrix(): ReadResult<PermissionMatrixData> {
  const live = source(KEY) === "live";

  // Always subscribe to cells for stable hook order
  const perms = screenPermsCell.use();
  const roles = roleCatalogCell.use();

  const query = useQuery({
    queryKey: screenPermKeys.matrix(),
    enabled: live,
    queryFn: ({ signal }) =>
      api
        .get<PermissionMatrixDto>("/admin/role-permissions", undefined, signal)
        .then(toPermissions),
  });

  // Same queryKey as roles.ts's useRoles(), so this shares its cache entry
  // instead of double-fetching when both screens are mounted. Needed because
  // this screen may be opened directly without the roles screen hydrating
  // roleCatalogCell first (mutation below needs real numeric role ids).
  useQuery({
    queryKey: ["roles", "list", {}],
    enabled: live,
    queryFn: ({ signal }) =>
      api.getList<RoleDto>("/roles", { per_page: 100 }, signal).then((r) => {
        const mapped = r.data.map(toRoleCatalogEntry);
        roleCatalogCell.set(mapped);
        return mapped;
      }),
  });

  // Roles always come from the role catalog cell (hydrated by the query
  // above in live mode, seeded by mock data otherwise) so display fields
  // like orgCode are correct either way — the matrix endpoint's own
  // roles/screens shape doesn't match what this screen needs (see toggle).
  const activeRoles = roles
    .filter((r) => r.active && r.code !== "rc_platform_admin")
    .sort((a, b) => `${a.orgCode}-${a.name}`.localeCompare(`${b.orgCode}-${b.name}`));

  const screens = MANAGED_SCREENS.map((s) => ({
    key: s.key,
    label: s.label,
    caps: s.caps,
  }));

  if (!live) {
    const permissions: Record<string, Record<string, ScreenCapability[]>> = {};
    for (const role of activeRoles) {
      permissions[role.code] = {};
      for (const screen of MANAGED_SCREENS) {
        const caps = screen.caps.filter((cap) =>
          manualScreenCan(role.code as RoleId, screen.key, cap),
        );
        if (caps.length > 0) {
          permissions[role.code][screen.key] = caps;
        }
      }
    }

    // Use perms to satisfy the linter (subscribed above for reactivity)
    void perms;

    return mockRead({
      roles: activeRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        orgCode: r.orgCode,
      })),
      screens,
      permissions,
    });
  }

  return {
    data: query.data && {
      roles: activeRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        orgCode: r.orgCode,
      })),
      screens,
      permissions: query.data,
    },
    isLoading: query.isLoading,
    error: (query.error as ReadResult<unknown>["error"]) ?? null,
    refetch: () => void query.refetch(),
  };
}

// ---------- Mutations ----------
function useLiveMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: screenPermKeys.matrix() });

  const toggle = useMutation({
    mutationFn: (i: ToggleInput) => {
      const roleId = roleCatalogCell.get().find((r) => r.code === i.roleCode)?.id;
      if (roleId === undefined) {
        return Promise.reject(new Error(`Unknown role code: ${i.roleCode}`));
      }
      return api
        .post("/admin/role-permissions/toggle", {
          role_id: roleId,
          screen_code: i.screen,
          capability: CAP_TO_BACKEND[i.cap],
          enabled: i.enabled,
        })
        .then(() => undefined);
    },
    onSuccess: invalidate,
  });

  return { toggle };
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

export function usePermissionMutations(auditCtx?: AuditInput) {
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
    return { togglePermission: handle(liveM.toggle) };
  }

  // Mock: write the cell synchronously, resolve immediately (spec §3.2).
  return {
    togglePermission: {
      ...idle,
      mutate: async (i: ToggleInput) => {
        setScreenPermission(i.screen, i.roleCode, i.cap, i.enabled);
        audit(
          `${i.enabled ? "منح" : "إلغاء"} صلاحية ${SCREEN_CAP_LABELS[i.cap] ?? i.cap}`,
          `${i.screen}:${i.roleCode}`,
          `${i.screenLabel}، ${i.roleName}`,
        );
      },
    } as MutationHandle<ToggleInput>,
  };
}
