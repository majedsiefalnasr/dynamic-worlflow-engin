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
        // NOTE (unverified for API/live mode): in mock mode the "طلب جديد"
        // button (src/routes/workflows.index.tsx:144) calls onCreate(), which
        // shows toast.success("تم إنشاء طلب جديد") (line 123) and navigates.
        // In API mode (src/routes/workflows.index.tsx:147-150) the same-text
        // button instead navigates to /workflows/instances/new, where
        // creating a request requires picking a real merchant name match
        // (workflows.instances.$id.tsx:371-372) and clicking "تقديم الطلب"
        // (line 392), which then toasts "تم إنشاء الطلب" (line 383) — a
        // different message reached via a different multi-step flow. This
        // probe is fixed for mock-mode semantics only; the API-mode path
        // cannot be probed with a single click + static expected text.
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
        // NOTE (unverified): "رمز المرحلة"/"اسم المرحلة" are <Input
        // placeholder> text (admin.workflows.tsx:489,494), not associated
        // <Label> text — there is no <Label> on this form at all, so
        // page.getByLabel() cannot find these inputs regardless of the
        // string used. Toast text fixed to "تم إضافة المرحلة" (line 434);
        // matrix previously had "تمت إضافة المرحلة" which does not exist.
        id: "wf-stages-add-valid",
        setup: [
          { action: "click-tab", trigger: "المراحل" },
          { action: "fill", label: "رمز المرحلة", value: "TEST_PROBE" },
          { action: "fill", label: "اسم المرحلة", value: "مرحلة اختبار" },
          { action: "click", trigger: "إضافة مرحلة" },
        ],
        expect: {
          kind: "valid",
          text: "تم إضافة المرحلة",
          cleanup: [{ action: "delete-row", text: "TEST_PROBE" }],
        },
      },
      {
        // Button text fixed: ActionsTab's add button is "إضافة" (no
        // "إجراء" suffix) — admin.workflows.tsx:2062-2064.
        id: "wf-actions-add-empty",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: { kind: "invalid", text: "الرمز والاسم مطلوبان" },
      },
      {
        // NOTE (unverified): "رمز الإجراء"/"اسم الإجراء" are <Input
        // placeholder> text (admin.workflows.tsx:2055,2057), no <Label> at
        // all on this form — page.getByLabel() cannot find these inputs.
        // Button text fixed to "إضافة" (line 2062-2064) and toast fixed to
        // "تم إضافة الإجراء" (line 2027); matrix previously had
        // "إضافة إجراء"/"تمت إضافة الإجراء" which do not exist.
        id: "wf-actions-add-valid",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "fill", label: "رمز الإجراء", value: "TEST_ACTION" },
          { action: "fill", label: "اسم الإجراء", value: "إجراء اختبار" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: {
          kind: "valid",
          text: "تم إضافة الإجراء",
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
        // NOTE (unverified): "المفتاح"/"اسم العرض" are <Label> text
        // (admin.reference-data.tsx:170,179) with no htmlFor, sibling to an
        // unconnected <Input> — page.getByLabel() cannot associate them.
        // Strings already match source exactly; left as-is since no valid
        // selector can be derived from source alone.
        id: "refdata-add-table-bad-key",
        setup: [
          { action: "fill", label: "المفتاح", value: "INVALID KEY!" },
          { action: "fill", label: "اسم العرض", value: "جدول اختبار" },
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: { kind: "invalid", text: "المفتاح يجب أن يكون بالإنجليزية مثل arrival_port" },
      },
      {
        // NOTE (unverified): same unlabeled-input issue as bad-key above.
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
        // Triggers/button text confirmed correct against
        // admin.entities.tsx:187 ("بنك جديد") and :475 ("إضافة"). This probe
        // is click-only (no fill), so it should work — capture.mjs's click
        // handler will still fail if the submit button is `disabled`,
        // since Playwright's actionability checks block clicking disabled
        // elements (that is a capture.mjs limitation, out of this file's
        // scope to fix).
        id: "entities-add-empty",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        // NOTE (unverified): "اسم البنك *"/"رقم الترخيص" are <Label> text
        // (admin.entities.tsx:394,398) with no htmlFor, sibling to an
        // unconnected <Input> — page.getByLabel() cannot find them. Added
        // the "*" suffix present on "اسم البنك" in source to match exactly,
        // though the lookup will still fail due to the missing association.
        id: "entities-add-valid",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "fill", label: "اسم البنك *", value: "بنك اختبار الفحص" },
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
        // NOTE (unverified): "اسم الجهة *" is <Label> text
        // (admin.orgs.tsx:457) with no htmlFor, sibling to an unconnected
        // <Input> — page.getByLabel() cannot find it. Added the "*" suffix
        // present in source to match exactly, though the lookup will still
        // fail due to the missing association. Triggers/submit text
        // ("جهة جديدة" line 247, "إضافة الجهة" line 496) confirmed correct.
        id: "orgs-add-valid",
        setup: [
          { action: "click", trigger: "جهة جديدة" },
          { action: "fill", label: "اسم الجهة *", value: "جهة اختبار الفحص" },
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
        // NOTE (unverified): "الاسم *"/"البريد الإلكتروني *" strings already
        // matched source exactly (admin.staff.tsx:764,768) before this fix.
        // Both are <Label> text with no htmlFor, sibling to an unconnected
        // <Input> — page.getByLabel() cannot find them regardless of the
        // string used. Left as-is since this is the closest-to-correct
        // selector derivable from source.
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
        // NOTE (unverified): "اسم الفريق *"/"الجهة *" are <Label> text
        // (admin.teams.tsx:519,527) with no htmlFor, sibling to an
        // unconnected <Input>/<Select> — page.getByLabel() cannot find
        // either. Added the "*" suffix present in source to match exactly,
        // though the lookup will still fail due to the missing association.
        // Triggers/submit text ("فريق جديد" line 252, "إضافة الفريق"
        // line 544) confirmed correct.
        id: "teams-add-valid",
        setup: [
          { action: "click", trigger: "فريق جديد" },
          { action: "fill", label: "اسم الفريق *", value: "فريق اختبار الفحص" },
          { action: "select", label: "الجهة *", value: 0 },
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
        // NOTE (unverified): "اسم الدور *"/"الجهة *" are <Label> text
        // (admin.roles.tsx:415,423) with no htmlFor, sibling to an
        // unconnected <Input>/<Select> — page.getByLabel() cannot find
        // either. Added the "*" suffix present in source to match exactly,
        // though the lookup will still fail due to the missing association.
        // Triggers/submit text ("دور جديد" line 204, "إضافة الدور" line 440)
        // confirmed correct.
        id: "roles-add-valid",
        setup: [
          { action: "click", trigger: "دور جديد" },
          { action: "fill", label: "اسم الدور *", value: "دور اختبار الفحص" },
          { action: "select", label: "الجهة *", value: 0 },
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
      // Button text fixed: the dialog's submit button is "حفظ التاجر"
      // (merchants.tsx:892), not "تسجيل" ("تسجيل" only appears in the
      // dialog title "تسجيل تاجر جديد" at line 243). Click-only probe
      // (no fill), so once the trigger text is correct this should work,
      // modulo capture.mjs's click handler failing on a disabled button
      // (out of this file's scope).
      id: "merchants-add-empty",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "click", trigger: "حفظ التاجر" },
      ],
      expect: { kind: "invalid", text: "submit-disabled" },
    },
    {
      // NOTE (unverified): "اسم التاجر *"/"الرقم الضريبي *"/
      // "تاريخ انتهاء البطاقة الضريبية *" are <Label> text (merchants.tsx
      // Field() component, used at lines 683,690,693) with no htmlFor,
      // sibling to an unconnected <Input> — page.getByLabel() cannot find
      // them. Added the "*" suffix present in source.
      // Additionally, "اسم الشركة"/"رقم السجل التجاري" are NOT labels at
      // all — they are placeholder text on raw <Input> elements inside the
      // "الشركات المرتبطة" (linked companies) repeater (lines 834,862,
      // plus an unlabeled date input at 866). A default empty company row
      // is already rendered (lines 629-641) without needing to click
      // "إضافة شركة" first, but page.getByLabel() still cannot reach these
      // 3 inputs regardless of the string used. These 3 fields ARE
      // required for `valid` (merchants.tsx:643-648 requires at least one
      // company with name+cr+crExpiry), so they cannot simply be dropped —
      // left in place as the closest-to-correct setup, though this probe
      // cannot pass without a capture.mjs change (e.g. locating inputs by
      // placeholder) which is out of this file's scope.
      // Button text fixed to "حفظ التاجر" (merchants.tsx:892).
      id: "merchants-add-valid",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "fill", label: "اسم التاجر *", value: "تاجر اختبار الفحص" },
        { action: "fill", label: "الرقم الضريبي *", value: "PROBE-TAX-999" },
        { action: "fill-date", label: "تاريخ انتهاء البطاقة الضريبية *", value: "2027-12-31" },
        { action: "fill", label: "اسم الشركة", value: "شركة اختبار" },
        { action: "fill", label: "رقم السجل التجاري", value: "CR-PROBE-999" },
        { action: "fill-date", label: "تاريخ انتهاء السجل", value: "2027-12-31" },
        { action: "click", trigger: "حفظ التاجر" },
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
