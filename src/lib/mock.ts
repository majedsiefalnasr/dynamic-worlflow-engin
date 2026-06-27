import { useSyncExternalStore } from "react";

// ============================================================
// Shared demo identity, organizations, and reference data.
// Request lifecycle data lives exclusively in `workflow-engine`.
// ============================================================

export type RoleId =
  | "rc_platform_admin"
  | "rc_bank_admin"
  | "rc_bank_intake"
  | "rc_bank_reviewer"
  | "rc_bank_swift"
  | "rc_support_member"
  | "rc_executive_member"
  | "rc_committee_manager"
  | (string & {});

export function getRoleLabel(roleId: string): string {
  // Lazy import avoided: governance.ts already imports from mock.ts.
  // Use a simple local map for mock mode; live mode uses user.roleLabel.
  const MOCK_ROLE_LABELS: Record<string, string> = {
    rc_platform_admin: "مسؤول نظام اللجنة",
    rc_bank_admin: "مسؤول البنك التجاري",
    rc_bank_intake: "موظف إدخال البنك التجاري",
    rc_bank_reviewer: "مراجع داخلي بالبنك التجاري",
    rc_bank_swift: "موظف العمليات الخارجية بالبنك التجاري",
    rc_support_member: "عضو اللجنة المساندة",
    rc_executive_member: "عضو اللجنة التنفيذية",
    rc_committee_manager: "مدير اللجنة التنفيذية",
  };
  return MOCK_ROLE_LABELS[roleId] ?? roleId;
}

export const BANK_ROLE_IDS: RoleId[] = [
  "rc_bank_admin",
  "rc_bank_intake",
  "rc_bank_reviewer",
  "rc_bank_swift",
];

const STORED_ROLE_ID_ALIASES: Record<string, RoleId> = {
  platform_admin: "rc_platform_admin",
  bank_admin: "rc_bank_admin",
  bank_intake: "rc_bank_intake",
  bank_reviewer: "rc_bank_reviewer",
  bank_swift: "rc_bank_swift",
  support_member: "rc_support_member",
  executive_member: "rc_executive_member",
  committee_manager: "rc_committee_manager",
};

export function normalizeRoleId(roleId: string | null | undefined): RoleId {
  if (!roleId) return "rc_bank_intake";
  return STORED_ROLE_ID_ALIASES[roleId] ?? roleId;
}

export type BankEntity = {
  id: number;
  code: string;
  name: string;
  licenseNumber?: string;
  swiftCode?: string;
  status: "active" | "inactive" | "suspended";
  _version?: number;
};

export const BANK_ENTITIES: BankEntity[] = [
  {
    id: 1,
    code: "ybrd",
    name: "البنك اليمني للإنشاء والتعمير",
    swiftCode: "YBRDYESA",
    licenseNumber: "BNK-001",
    status: "active",
  },
  {
    id: 2,
    code: "tsib",
    name: "بنك التضامن الإسلامي",
    swiftCode: "TSIBYESA",
    licenseNumber: "BNK-002",
    status: "active",
  },
  {
    id: 3,
    code: "sbai",
    name: "بنك سبأ الإسلامي",
    swiftCode: "SBAIYESA",
    licenseNumber: "BNK-003",
    status: "active",
  },
];

export type OrgKind = string;
export type TeamId = string;
export type BuiltinTeamId =
  | "team_entry"
  | "team_internal"
  | "team_fx"
  | "team_admin_bank"
  | "team_support"
  | "team_exec"
  | "team_fx_confirm"
  | "team_platform_admin";

export const TEAM_LABELS: Record<TeamId, string> = {
  team_entry: "فريق الإدخال",
  team_internal: "فريق المراجعة الداخلية",
  team_fx: "فريق العمليات الخارجية",
  team_admin_bank: "فريق الإدارة (البنك)",
  team_support: "فريق اللجنة المساندة",
  team_exec: "فريق اللجنة التنفيذية",
  team_fx_confirm: "فريق تأكيد العمليات",
  team_platform_admin: "إدارة النظام",
};

export const BANK_TEAMS: TeamId[] = ["team_entry", "team_internal", "team_fx", "team_admin_bank"];
export const COMMITTEE_TEAMS: TeamId[] = ["team_support", "team_exec", "team_fx_confirm"];

export const TEAM_ROLE: Record<TeamId, RoleId> = {
  team_entry: "rc_bank_intake",
  team_internal: "rc_bank_reviewer",
  team_fx: "rc_bank_swift",
  team_admin_bank: "rc_bank_admin",
  team_support: "rc_support_member",
  team_exec: "rc_executive_member",
  team_fx_confirm: "rc_committee_manager",
  team_platform_admin: "rc_platform_admin",
};

export type ScreenPermission = {
  screen: string;
  capabilities: string[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  roleId: RoleId;
  roleLabel: string;
  role: { id: number; code: string; name: string } | null;
  organization: { id: number; code: string; name: string } | null;
  team: { id: number; code: string; name: string } | null;
  bank: { id: number; code: string; name: string } | null;
  bankId: number | null;
  isActive: boolean;
  avatar: string;
  phone?: string;
  screenPermissions: ScreenPermission[];
  capabilities: string[];
  _version?: number;
};

export function computeAvatar(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0]?.[0] ?? "";
  return (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "");
}

export const DEMO_USERS: User[] = [
  {
    id: 1,
    name: "ياسر الحضرمي",
    email: "admin@cby.gov.ye",
    roleId: "rc_platform_admin",
    roleLabel: "مسؤول نظام اللجنة",
    role: { id: 1, code: "rc_platform_admin", name: "مسؤول نظام اللجنة" },
    organization: { id: 3, code: "platform", name: "إدارة النظام" },
    team: { id: 8, code: "team_platform_admin", name: "إدارة النظام" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "يح",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 4,
    name: "أحمد المقطري",
    email: "admin@ybank.ye",
    roleId: "rc_bank_admin",
    roleLabel: "مسؤول البنك التجاري",
    role: { id: 2, code: "rc_bank_admin", name: "مسؤول البنك التجاري" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 4, code: "team_admin_bank", name: "فريق الإدارة (البنك)" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true,
    avatar: "أم",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 5,
    name: "علي القاضي",
    email: "intake@ybank.ye",
    roleId: "rc_bank_intake",
    roleLabel: "موظف إدخال البنك التجاري",
    role: { id: 3, code: "rc_bank_intake", name: "موظف إدخال البنك التجاري" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 1, code: "team_entry", name: "فريق الإدخال" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true,
    avatar: "عق",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 6,
    name: "نوال الحاج",
    email: "reviewer@ybank.ye",
    roleId: "rc_bank_reviewer",
    roleLabel: "مراجع داخلي بالبنك التجاري",
    role: { id: 4, code: "rc_bank_reviewer", name: "مراجع داخلي بالبنك التجاري" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 2, code: "team_internal", name: "فريق المراجعة الداخلية" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true,
    avatar: "نح",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 2,
    name: "محمد الشامي",
    email: "m.shami@cby.gov.ye",
    roleId: "rc_support_member",
    roleLabel: "عضو اللجنة المساندة",
    role: { id: 6, code: "rc_support_member", name: "عضو اللجنة المساندة" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 5, code: "team_support", name: "فريق اللجنة المساندة" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "مش",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 7,
    name: "سامي العتمي",
    email: "swift@ybank.ye",
    roleId: "rc_bank_swift",
    roleLabel: "موظف العمليات الخارجية بالبنك التجاري",
    role: { id: 5, code: "rc_bank_swift", name: "موظف العمليات الخارجية بالبنك التجاري" },
    organization: { id: 1, code: "bank", name: "البنوك التجارية" },
    team: { id: 3, code: "team_fx", name: "فريق العمليات الخارجية" },
    bank: { id: 1, code: "ybank", name: "البنك اليمني للإنشاء والتعمير" },
    bankId: 1,
    isActive: true,
    avatar: "سع",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 9,
    name: "د. هدى الإرياني",
    email: "huda@cby.gov.ye",
    roleId: "rc_committee_manager",
    roleLabel: "مدير اللجنة التنفيذية",
    role: { id: 8, code: "rc_committee_manager", name: "مدير اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 7, code: "team_fx_confirm", name: "فريق تأكيد العمليات" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "هإ",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 10,
    name: "م. سامي الذماري",
    email: "sami@cby.gov.ye",
    roleId: "rc_executive_member",
    roleLabel: "عضو اللجنة التنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "سذ",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 11,
    name: "د. ندى الكبسي",
    email: "nada@cby.gov.ye",
    roleId: "rc_executive_member",
    roleLabel: "عضو اللجنة التنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "نك",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 12,
    name: "أ. فهد الشرعبي",
    email: "fahd@cby.gov.ye",
    roleId: "rc_executive_member",
    roleLabel: "عضو اللجنة التنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "فش",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 13,
    name: "د. أمينة العزب",
    email: "amina@cby.gov.ye",
    roleId: "rc_executive_member",
    roleLabel: "عضو اللجنة التنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "أع",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
  {
    id: 14,
    name: "م. خالد الأنسي",
    email: "khaled@cby.gov.ye",
    roleId: "rc_executive_member",
    roleLabel: "عضو اللجنة التنفيذية",
    role: { id: 7, code: "rc_executive_member", name: "عضو اللجنة التنفيذية" },
    organization: { id: 2, code: "committee", name: "اللجنة الوطنية لتمويل الواردات" },
    team: { id: 6, code: "team_exec", name: "فريق اللجنة التنفيذية" },
    bank: null,
    bankId: null,
    isActive: true,
    avatar: "خأ",
    phone: undefined,
    screenPermissions: [],
    capabilities: [],
  },
];

// Persist system users so additions/edits survive a page reload. The stored
// snapshot (when present) fully replaces the demo defaults.
const USERS_KEY = "cby:users";

function loadStoredUsers(): User[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0] as Record<string, unknown>;
    // Detect old shape: string id or missing role object → discard
    if (typeof first.id === "string" || !("role" in first)) return null;
    return parsed as User[];
  } catch {
    return null;
  }
}

const storedUsers = loadStoredUsers();
if (storedUsers && storedUsers.length > 0) {
  DEMO_USERS.length = 0;
  DEMO_USERS.push(...storedUsers);
}

export function saveUsers() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(DEMO_USERS));
  } catch {
    // localStorage may be unavailable in private mode — ignore.
  }
}

type AuthSnapshot = { user: User | null; lang: "ar" | "en"; theme: "light" | "dark" };
let currentUser: User | null = null;
let lang: "ar" | "en" = "ar";
let theme: "light" | "dark" = "light";
let snapshot: AuthSnapshot = { user: currentUser, lang, theme };
const serverSnapshot: AuthSnapshot = { user: null, lang: "ar", theme: "light" };
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { user: currentUser, lang, theme };
  listeners.forEach((l) => l());
};

export const auth = {
  get user() {
    return currentUser;
  },
  get lang() {
    return lang;
  },
  get theme() {
    return theme;
  },
  login(u: User) {
    currentUser = u;
    emit();
  },
  logout() {
    currentUser = null;
    emit();
  },
  setLang(l: "ar" | "en") {
    lang = l;
    emit();
  },
  toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAuth() {
  return useSyncExternalStore(
    (l) => auth.subscribe(l),
    () => snapshot,
    () => serverSnapshot,
  );
}

const types = [
  "مواد غذائية",
  "أدوية ومستلزمات طبية",
  "مشتقات نفطية",
  "قطع غيار",
  "مواد بناء",
  "إلكترونيات",
];
const importers = [
  "شركة هائل سعيد أنعم",
  "مجموعة الشيباني",
  "شركة ثابت إخوان",
  "شركة الكميم للأدوية",
  "مجموعة الأهدل",
];

export type Merchant = {
  id: string;
  name: string;
  tax: string;
  cr: string;
  address: string;
  contact: string;
  category: string;
  status: "active" | "suspended";
  transactions: number;
  entityId?: string;
  taxCardExpiry?: string;
  commercialRegistrationExpiry?: string;
  owners?: { id: string; name: string; share: number }[];
  linkedCompanies?: { id: string; name: string; category: string; cr: string; crExpiry: string }[];
};

export const MERCHANTS: Merchant[] = importers.map((n, i) => ({
  id: `m${i + 1}`,
  name: n,
  tax: `4${String(100000 + i * 7777)}`,
  cr: `CR-${String(50000 + i * 13)}`,
  taxCardExpiry: "2026-06-16",
  commercialRegistrationExpiry: "2026-06-16",
  owners: [{ id: `own${i + 1}`, name: `${n} - المالك الرئيسي`, share: 25 }],
  linkedCompanies: [
    {
      id: `mc${i + 1}`,
      name: n,
      category: types[i % types.length],
      cr: `CR-${String(50000 + i * 13)}`,
      crExpiry: "2026-06-16",
    },
  ],
  address: ["صنعاء – شارع الزبيري", "عدن – كريتر", "الحديدة – شارع صنعاء", "المكلا", "تعز"][i % 5],
  contact: `+9677${String(11000000 + i * 9999)}`,
  category: types[i % types.length],
  status: i === 4 ? "suspended" : "active",
  transactions: 3 + i * 4,
  entityId: String(BANK_ENTITIES[i % BANK_ENTITIES.length].id),
}));

export type AuditLog = {
  id: string;
  user: string;
  action: string;
  ts: string;
  ip: string;
  device: string;
  ref: string;
};

export const AUDIT: AuditLog[] = Array.from({ length: 25 }, (_, i) => ({
  id: `a${i}`,
  user: DEMO_USERS[i % DEMO_USERS.length].name,
  action: ["تسجيل دخول", "إنشاء طلب", "تنفيذ إجراء سير عمل", "تحديث بيانات", "تصدير تقرير"][i % 5],
  ts: new Date(Date.now() - i * 3600000).toISOString(),
  ip: `196.${10 + (i % 200)}.${i % 255}.${(i * 13) % 255}`,
  device: ["Chrome / Win", "Edge / Win", "Safari / macOS", "Firefox / Linux"][i % 4],
  ref: `INV-2026-${10000 + (i % 16)}`,
}));

export const MONTHLY = [
  { m: "يناير", طلبات: 120, مُعتمد: 95, مرفوض: 12 },
  { m: "فبراير", طلبات: 142, مُعتمد: 110, مرفوض: 18 },
  { m: "مارس", طلبات: 165, مُعتمد: 130, مرفوض: 20 },
  { m: "أبريل", طلبات: 138, مُعتمد: 108, مرفوض: 14 },
  { m: "مايو", طلبات: 178, مُعتمد: 145, مرفوض: 19 },
  { m: "يونيو", طلبات: 195, مُعتمد: 160, مرفوض: 22 },
  { m: "يوليو", طلبات: 210, مُعتمد: 178, مرفوض: 21 },
  { m: "أغسطس", طلبات: 188, مُعتمد: 152, مرفوض: 25 },
  { m: "سبتمبر", طلبات: 220, مُعتمد: 185, مرفوض: 23 },
  { m: "أكتوبر", طلبات: 245, مُعتمد: 205, مرفوض: 24 },
];

export const CATEGORY_DIST = types.map((name, i) => ({ name, value: [32, 22, 18, 12, 9, 7][i] }));

export const NOTIFICATIONS = [
  {
    id: "n1",
    title: "طلب جديد بحاجة لمراجعتك",
    body: "طلب من محرّك سير العمل في مرحلتك الحالية",
    time: "منذ 5 دقائق",
    unread: true,
  },
  {
    id: "n2",
    title: "تم تنفيذ إجراء سير عمل",
    body: "انتقل الطلب إلى المرحلة التالية",
    time: "منذ 32 دقيقة",
    unread: true,
  },
  {
    id: "n3",
    title: "تنبيه: فاتورة مكررة",
    body: "رقم فاتورة مستخدم في أكثر من طلب",
    time: "منذ ساعة",
    unread: true,
  },
  {
    id: "n4",
    title: "تم إغلاق طلب",
    body: "اكتمل مسار سير العمل",
    time: "اليوم 09:14",
    unread: false,
  },
  {
    id: "n5",
    title: "تحديث في مصمم سير العمل",
    body: "تم نشر نسخة جديدة من سير العمل",
    time: "أمس",
    unread: false,
  },
];
