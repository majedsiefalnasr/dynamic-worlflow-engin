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
  {
    key: "requests",
    path: "/workflows",
    probes: [
      {
        id: "requests-new",
        setup: [
          { action: "click", trigger: "طلب جديد" },
        ],
        expect: {
          kind: "valid",
          text: "تم إنشاء طلب جديد",
          cleanup: [],
        },
      },
    ],
  },
  { key: "notifications", path: "/notifications" },
  { key: "profile", path: "/profile" },
];

const REPORTS_AUDIT_SCREENS = [
  { key: "reports", path: "/reports" },
  { key: "audit", path: "/audit" },
];

const ADMIN_SCREENS = [
  {
    key: "admin-workflows",
    path: "/admin/workflows",
    interactions: [
      { key: "tab-stages", type: "tab", trigger: "المراحل" },
      { key: "tab-stage-routing", type: "tab", trigger: "سير العملية التنظيمية" },
      { key: "tab-transitions", type: "tab", trigger: "الانتقالات" },
      { key: "tab-assignments", type: "tab", trigger: "الصلاحيات" },
      { key: "tab-fields", type: "tab", trigger: "الحقول" },
      { key: "tab-rules", type: "tab", trigger: "قواعد الحقول" },
      { key: "tab-actions", type: "tab", trigger: "الإجراءات" },
    ],
    probes: [
      {
        id: "wf-stages-add-empty",
        setup: [
          { action: "click-tab", trigger: "المراحل" },
          { action: "click", trigger: "إضافة مرحلة" },
        ],
        expect: { kind: "invalid", text: "الاسم والرمز مطلوبان" },
      },
      {
        id: "wf-stages-add-valid",
        setup: [
          { action: "click-tab", trigger: "المراحل" },
          { action: "fill", label: "رمز المرحلة", value: "TEST_PROBE" },
          { action: "fill", label: "اسم المرحلة", value: "مرحلة اختبار" },
          { action: "click", trigger: "إضافة مرحلة" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة المرحلة",
          cleanup: [{ action: "delete-row", text: "TEST_PROBE" }],
        },
      },
      {
        id: "wf-actions-add-empty",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "click", trigger: "إضافة إجراء" },
        ],
        expect: { kind: "invalid", text: "الرمز والاسم مطلوبان" },
      },
      {
        id: "wf-actions-add-valid",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "fill", label: "رمز الإجراء", value: "TEST_ACTION" },
          { action: "fill", label: "اسم الإجراء", value: "إجراء اختبار" },
          { action: "click", trigger: "إضافة إجراء" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة الإجراء",
          cleanup: [{ action: "delete-row", text: "TEST_ACTION" }],
        },
      },
    ],
  },
  { key: "admin-reference-data", path: "/admin/reference-data",
    probes: [
      {
        id: "refdata-add-table-empty",
        setup: [
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: { kind: "invalid", text: "المفتاح والاسم مطلوبان" },
      },
      {
        id: "refdata-add-table-bad-key",
        setup: [
          { action: "fill", label: "المفتاح", value: "INVALID KEY!" },
          { action: "fill", label: "اسم العرض", value: "جدول اختبار" },
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: { kind: "invalid", text: "المفتاح يجب أن يكون بالإنجليزية مثل arrival_port" },
      },
      {
        id: "refdata-add-table-valid",
        setup: [
          { action: "fill", label: "المفتاح", value: "test_probe_tbl" },
          { action: "fill", label: "اسم العرض", value: "جدول اختبار" },
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة جدول داخلي",
          cleanup: [{ action: "delete-card", text: "جدول اختبار" }],
        },
      },
    ],
  },
  { key: "admin-screen-permissions", path: "/admin/screen-permissions" },
  {
    key: "admin-entities",
    path: "/admin/entities",
    interactions: [
      { key: "dialog-view", type: "dialog", trigger: "عرض" },
    ],
    probes: [
      {
        id: "entities-add-empty",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "entities-add-valid",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "fill", label: "اسم البنك", value: "بنك اختبار الفحص" },
          { action: "fill", label: "رقم الترخيص", value: "BNK-TEST-999" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "بنك اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-orgs",
    path: "/admin/orgs",
    probes: [
      {
        id: "orgs-add-empty",
        setup: [
          { action: "click", trigger: "جهة جديدة" },
          { action: "click", trigger: "إضافة الجهة" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "orgs-add-valid",
        setup: [
          { action: "click", trigger: "جهة جديدة" },
          { action: "fill", label: "اسم الجهة", value: "جهة اختبار الفحص" },
          { action: "click", trigger: "إضافة الجهة" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "جهة اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-staff",
    path: "/admin/staff",
    interactions: [
      { key: "dialog-view", type: "dialog", trigger: "عرض" },
    ],
    probes: [
      {
        id: "staff-add-bad-email",
        setup: [
          { action: "click", trigger: "مستخدم جديد" },
          { action: "fill", label: "الاسم *", value: "مستخدم اختبار" },
          { action: "fill", label: "البريد الإلكتروني *", value: "not-an-email" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
    ],
  },
  {
    key: "admin-teams",
    path: "/admin/teams",
    probes: [
      {
        id: "teams-add-empty",
        setup: [
          { action: "click", trigger: "فريق جديد" },
          { action: "click", trigger: "إضافة الفريق" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "teams-add-valid",
        setup: [
          { action: "click", trigger: "فريق جديد" },
          { action: "fill", label: "اسم الفريق", value: "فريق اختبار الفحص" },
          { action: "select", label: "الجهة", value: 0 },
          { action: "click", trigger: "إضافة الفريق" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "فريق اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-roles",
    path: "/admin/roles",
    probes: [
      {
        id: "roles-add-empty",
        setup: [
          { action: "click", trigger: "دور جديد" },
          { action: "click", trigger: "إضافة الدور" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "roles-add-valid",
        setup: [
          { action: "click", trigger: "دور جديد" },
          { action: "fill", label: "اسم الدور", value: "دور اختبار الفحص" },
          { action: "select", label: "الجهة", value: 0 },
          { action: "click", trigger: "إضافة الدور" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "دور اختبار الفحص" }],
        },
      },
    ],
  },
  { key: "settings", path: "/settings" },
];

const MERCHANTS_SCREEN = {
  key: "merchants",
  path: "/merchants",
  interactions: [
    { key: "dialog-view", type: "dialog", trigger: "عرض" },
  ],
  probes: [
    {
      id: "merchants-add-empty",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "click", trigger: "تسجيل" },
      ],
      expect: { kind: "invalid", text: "submit-disabled" },
    },
    {
      id: "merchants-add-valid",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "fill", label: "اسم التاجر", value: "تاجر اختبار الفحص" },
        { action: "fill", label: "الرقم الضريبي", value: "PROBE-TAX-999" },
        { action: "fill-date", label: "تاريخ انتهاء البطاقة الضريبية", value: "2027-12-31" },
        { action: "fill", label: "اسم الشركة", value: "شركة اختبار" },
        { action: "fill", label: "رقم السجل التجاري", value: "CR-PROBE-999" },
        { action: "fill-date", label: "تاريخ انتهاء السجل", value: "2027-12-31" },
        { action: "click", trigger: "تسجيل" },
      ],
      expect: {
        kind: "valid",
        text: "تم تسجيل التاجر",
        cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "تاجر اختبار الفحص" }],
      },
    },
  ],
};

export const ROLES = [
  {
    roleId: "rc_platform_admin",
    email: "admin@cby.gov.ye",
    name: "ياسر الحضرمي",
    screens: [
      ...COMMON_SCREENS,
      MERCHANTS_SCREEN,
      ...REPORTS_AUDIT_SCREENS,
      ...ADMIN_SCREENS,
    ],
  },
  {
    roleId: "rc_bank_admin",
    email: "admin@ybank.ye",
    name: "أحمد المقطري",
    screens: [...COMMON_SCREENS, MERCHANTS_SCREEN, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_bank_intake",
    email: "intake@ybank.ye",
    name: "علي القاضي",
    screens: [...COMMON_SCREENS, MERCHANTS_SCREEN],
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
