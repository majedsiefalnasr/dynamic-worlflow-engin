// Role × screen matrix for the main-vs-live UI comparison capture.
// `screens` lists every route a role can reach, derived from
// src/lib/governance.ts (screen perms) + workflow-bridge.ts (requests access,
// granted to every demo role) — see docs/superpowers/specs/2026-06-26-ui-behavior-comparison-design.md

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

const COMMON_SCREENS = [
  { key: "dashboard", path: "/" },
  { key: "requests", path: "/workflows" },
  { key: "notifications", path: "/notifications" },
  { key: "profile", path: "/profile" },
];

const REPORTS_AUDIT_SCREENS = [
  { key: "reports", path: "/reports" },
  { key: "audit", path: "/audit" },
];

const ADMIN_SCREENS = [
  { key: "admin-workflows", path: "/admin/workflows" },
  { key: "admin-reference-data", path: "/admin/reference-data" },
  { key: "admin-screen-permissions", path: "/admin/screen-permissions" },
  { key: "admin-entities", path: "/admin/entities" },
  { key: "admin-orgs", path: "/admin/orgs" },
  { key: "admin-staff", path: "/admin/staff" },
  { key: "admin-teams", path: "/admin/teams" },
  { key: "admin-roles", path: "/admin/roles" },
  { key: "settings", path: "/settings" },
];

export const ROLES = [
  {
    roleId: "rc_platform_admin",
    email: "admin@cby.gov.ye",
    name: "ياسر الحضرمي",
    screens: [
      ...COMMON_SCREENS,
      { key: "merchants", path: "/merchants" },
      ...REPORTS_AUDIT_SCREENS,
      ...ADMIN_SCREENS,
    ],
  },
  {
    roleId: "rc_bank_admin",
    email: "admin@ybank.ye",
    name: "أحمد المقطري",
    screens: [...COMMON_SCREENS, { key: "merchants", path: "/merchants" }, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_bank_intake",
    email: "intake@ybank.ye",
    name: "علي القاضي",
    screens: [...COMMON_SCREENS, { key: "merchants", path: "/merchants" }],
  },
  {
    roleId: "rc_bank_reviewer",
    email: "reviewer@ybank.ye",
    name: "نوال الحاج",
    screens: [...COMMON_SCREENS],
  },
  {
    roleId: "rc_bank_swift",
    email: "swift@ybank.ye",
    name: "سامي العتمي",
    screens: [...COMMON_SCREENS],
  },
  {
    roleId: "rc_support_member",
    email: "m.shami@cby.gov.ye",
    name: "محمد الشامي",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_executive_member",
    email: "sami@cby.gov.ye",
    name: "م. سامي الذماري",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_committee_manager",
    email: "huda@cby.gov.ye",
    name: "د. هدى الإرياني",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
];

export const DEV_PASSWORD = "Password@123";
