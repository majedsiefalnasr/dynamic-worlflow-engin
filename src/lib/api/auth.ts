// ============================================================
// Auth — live login/logout against the backend.
//
// POST /auth/login returns { data: { user, mode, token, token_type } }.
// We store the bearer token (in memory) and map the backend user onto the
// app's existing `User` shape so RoleGuard / identity keep working unchanged.
//
// KNOWN BACKEND GAPS (see BACKEND-CHANGE-REQUESTS):
//  - user.role currently comes back null → we fall back to team→role mapping.
//  - permissions (screen_permissions/capabilities) are empty until the backend
//    grants them, so data endpoints return 403 even for the admin (BE-10).
// ============================================================

import { useMutation } from "@tanstack/react-query";
import { api, tokenStore, hasApiBase } from "./client";
import { BANK_ROLE_IDS, normalizeRoleId, TEAM_ROLE, type RoleId, type User } from "@/lib/mock";

interface ApiRef {
  id: number;
  code: string;
  name: string;
}

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: ApiRef | null;
  role_label?: string | null;
  organization?: ApiRef | null;
  team?: ApiRef | null;
  bank_id?: number | null;
  bank_name?: string | null;
  is_active?: boolean;
  screen_permissions?: unknown[];
  capabilities?: unknown[];
}

interface LoginData {
  user: ApiUser;
  mode?: string;
  token?: string;
  token_type?: string;
  mfa_required?: boolean;
  challenge_token?: string;
}

function orgKindFor(roleId: RoleId): string {
  if (roleId === "rc_platform_admin") return "platform";
  if ((BANK_ROLE_IDS as string[]).includes(roleId)) return "bank";
  return "committee";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
}

/** Maps the backend user payload onto the app's local `User` shape. */
export function mapApiUserToAppUser(u: ApiUser): User {
  const teamCode = u.team?.code;
  // Backend returns role=null today; fall back to the seeded team→role mapping.
  const roleId = normalizeRoleId(u.role?.code ?? (teamCode ? TEAM_ROLE[teamCode] : undefined));
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    roleId,
    entityId: u.bank_id != null ? String(u.bank_id) : null,
    org: [u.organization?.name, u.team?.name].filter(Boolean).join(" — "),
    avatar: initials(u.name),
    active: u.is_active ?? true,
    orgKind: orgKindFor(roleId),
    teamId: teamCode,
  };
}

export interface LoginResult {
  user: User;
  mfaRequired: boolean;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const data = await api.post<LoginData>("/auth/login", { email, password, device_name: "web" });
  if (data?.token) tokenStore.set(data.token);
  return { user: mapApiUserToAppUser(data.user), mfaRequired: Boolean(data?.mfa_required) };
}

export async function logout(): Promise<void> {
  try {
    if (hasApiBase() && tokenStore.get()) await api.post("/auth/logout");
  } catch {
    // best effort — clear locally regardless
  } finally {
    tokenStore.clear();
  }
}

export function useLogin() {
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) => login(vars.email, vars.password),
  });
}
