import { api, tokenStore } from "./http";
import { hasApiBase } from "./source";
import { auth, computeAvatar, type User } from "@/lib/mock";
import { syncWorkflowUser } from "@/lib/workflow-bridge";

interface UserResourceDto {
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

interface LoginResponse {
  user: UserResourceDto;
  token: string;
  token_type: string;
  mode: string;
}

export function toUser(dto: UserResourceDto): User {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    roleId: dto.role?.code ?? "",
    roleLabel: dto.role?.name ?? dto.role_label ?? "",
    role: dto.role,
    organization: dto.organization,
    team: dto.team,
    bank: dto.bank,
    bankId: dto.bank_id,
    isActive: dto.is_active,
    avatar: computeAvatar(dto.name),
    phone: undefined,
    screenPermissions: dto.screen_permissions ?? [],
    capabilities: dto.capabilities ?? [],
    _version: dto.version,
  };
}

export function isLive(): boolean {
  return hasApiBase();
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<LoginResponse>("/auth/login", { email, password });
  tokenStore.set(res.token);
  const user = toUser(res.user);
  auth.login(user);
  syncWorkflowUser(user);
  return user;
}

export async function fetchMe(): Promise<User> {
  const dto = await api.get<UserResourceDto>("/auth/me");
  const user = toUser(dto);
  auth.login(user);
  syncWorkflowUser(user);
  return user;
}

export async function logout(): Promise<void> {
  api.post("/auth/logout").catch(() => {});
  tokenStore.clear();
  auth.logout();
}
