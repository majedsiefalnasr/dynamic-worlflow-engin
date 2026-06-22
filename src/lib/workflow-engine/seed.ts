import { store, uid } from "./storage";
import type {
  WfOrganization, WfTeam, WfRole, WfUser,
  WorkflowDefinition, WorkflowVersion, WorkflowStage, WorkflowTransition,
  WorkflowAction, StageAssignment, FieldDefinition, FieldGroup, StageRoutingRule, FieldRule,
  WorkflowInstance, WorkflowHistory,
} from "./types";

// ------------------------------------------------------------
// Seed: Import Financing workflow per the brief.
// Runs once on first load (if no workflow definitions exist).
// ------------------------------------------------------------

const SEED_VERSION = "2026-06-22-request-identifiers-and-duplicate-warning";
const SEED_VERSION_KEY = "wfe:seedVersion";

export function seedIfEmpty() {
  if (typeof window !== "undefined" && window.localStorage.getItem(SEED_VERSION_KEY) !== SEED_VERSION) {
    reseed();
    return;
  }
  if (store.definitions.get().length > 0) return;
  seed();
  markSeedVersion();
}

export function reseed() {
  // wipe engine tables
  (["orgs", "teams", "roles", "users", "definitions", "versions", "stages", "stageGroups", "stageRoutingRules",
    "transitions", "actions", "assignments", "fieldDefs", "fieldGroups", "fieldRules",
    "instances", "history"] as const).forEach((k) => store[k].set([] as never));
  seed();
  markSeedVersion();
}

function markSeedVersion() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
  }
}

function seed() {
  // ---------- Organizations ----------
  const orgs: WfOrganization[] = [
    { id: "org_bank", name: "البنوك التجارية" },
    { id: "org_committee", name: "اللجنة الوطنية لتمويل الواردات" },
  ];
  store.orgs.set(orgs);

  // ---------- Teams ----------
  const teams: WfTeam[] = [
    { id: "team_entry", organizationId: "org_bank", name: "فريق الإدخال" },
    { id: "team_internal", organizationId: "org_bank", name: "فريق المراجعة الداخلية" },
    { id: "team_fx", organizationId: "org_bank", name: "فريق العمليات الخارجية" },
    { id: "team_admin_bank", organizationId: "org_bank", name: "فريق الإدارة (البنك)" },
    { id: "team_support", organizationId: "org_committee", name: "فريق اللجنة المساندة" },
    { id: "team_exec", organizationId: "org_committee", name: "فريق اللجنة التنفيذية" },
    { id: "team_fx_confirm", organizationId: "org_committee", name: "فريق تأكيد العمليات" },
  ];
  store.teams.set(teams);

  // ---------- Roles ----------
  const roles: WfRole[] = [
    { id: "role_entry", code: "ENTRY", name: "موظف إدخال" },
    { id: "role_reviewer", code: "REVIEWER", name: "مراجع داخلي" },
    { id: "role_fx", code: "FX", name: "موظف عمليات خارجية" },
    { id: "role_support", code: "SUPPORT", name: "عضو لجنة مساندة" },
    { id: "role_exec_member", code: "EXEC_MEMBER", name: "عضو اللجنة التنفيذية" },
    { id: "role_exec_lead", code: "EXEC_LEAD", name: "قائد اللجنة التنفيذية" },
    { id: "role_fx_confirm", code: "FX_CONFIRM", name: "عضو تأكيد العمليات" },
    { id: "role_admin", code: "ADMIN", name: "مسؤول النظام" },
  ];
  store.roles.set(roles);

  // ---------- Users ----------
  const users: WfUser[] = [
    { id: "wu_entry", fullName: "علي القاضي", email: "intake@bank", organizationId: "org_bank", teamIds: ["team_entry"], roleIds: ["role_entry"] },
    { id: "wu_reviewer", fullName: "نوال الحاج", email: "reviewer@bank", organizationId: "org_bank", teamIds: ["team_internal"], roleIds: ["role_reviewer"] },
    { id: "wu_fx", fullName: "سامي العتمي", email: "fx@bank", organizationId: "org_bank", teamIds: ["team_fx"], roleIds: ["role_fx"] },
    { id: "wu_support", fullName: "محمد الشامي", email: "support@committee", organizationId: "org_committee", teamIds: ["team_support"], roleIds: ["role_support"] },
    { id: "wu_exec_lead", fullName: "د. هدى الإرياني", email: "lead@committee", organizationId: "org_committee", teamIds: ["team_exec"], roleIds: ["role_exec_lead", "role_exec_member"] },
    { id: "wu_exec_member", fullName: "م. سامي الذماري", email: "member@committee", organizationId: "org_committee", teamIds: ["team_exec"], roleIds: ["role_exec_member"] },
    { id: "wu_fx_confirm", fullName: "أ. فهد الشرعبي", email: "fxc@committee", organizationId: "org_committee", teamIds: ["team_fx_confirm"], roleIds: ["role_fx_confirm"] },
    { id: "wu_admin", fullName: "ياسر الحضرمي", email: "admin@cby", organizationId: "org_committee", teamIds: [], roleIds: ["role_admin"] },
  ];
  store.users.set(users);

  // ---------- Actions library ----------
  const actions: WorkflowAction[] = [
    { id: "act_save", code: "SAVE_DRAFT", name: "حفظ مسودة", kind: "draft" },
    { id: "act_approve", code: "APPROVE", name: "اعتماد", kind: "approve" },
    { id: "act_reject", code: "REJECT", name: "رفض", kind: "reject" },
    { id: "act_return", code: "RETURN", name: "إرجاع", kind: "return" },
    { id: "act_close", code: "CLOSE", name: "إغلاق", kind: "close" },
    { id: "act_reject_final", code: "REJECT_FINAL", name: "رفض نهائي", kind: "reject" },
    { id: "act_more_info", code: "MORE_INFO", name: "طلب معلومات إضافية", kind: "info" },
    { id: "act_add_notes", code: "ADD_NOTES", name: "إضافة ملاحظات", kind: "custom" },
    { id: "act_upload_docs", code: "UPLOAD_DOCS", name: "رفع مستندات", kind: "custom" },
    { id: "act_final_approve", code: "FINAL_APPROVE", name: "اعتماد نهائي", kind: "approve" },
  ];
  store.actions.set(actions);

  // ---------- Definition + Version ----------
  const def: WorkflowDefinition = {
    id: "wf_import",
    code: "IMPORT_FINANCING",
    name: "تمويل الواردات",
    description: "سير العمل الكامل لطلبات تمويل الواردات من إدخال البنك حتى الاعتماد النهائي.",
    activeVersionId: "ver_v1",
    createdAt: new Date().toISOString(),
  };
  const version: WorkflowVersion = {
    id: "ver_v1",
    workflowId: def.id,
    version: "1.0",
    isPublished: true,
    createdAt: new Date().toISOString(),
  };
  store.definitions.set([def]);
  store.versions.set([version]);

  store.stageGroups.set([]);

  // ---------- Stages ----------
  const stages: WorkflowStage[] = [
    { id: "stg_create", workflowVersionId: version.id, code: "CREATE", name: "إنشاء الطلب", order: 1, isInitial: true },
    { id: "stg_internal", workflowVersionId: version.id, code: "INTERNAL", name: "المراجعة الداخلية", order: 2 },
    { id: "stg_support", workflowVersionId: version.id, code: "SUPPORT", name: "المراجعة المساندة", order: 3 },
    { id: "stg_exec", workflowVersionId: version.id, code: "EXEC", name: "القرار التنفيذي", order: 4 },
    { id: "stg_fx", workflowVersionId: version.id, code: "FX", name: "عمليات الصرف", order: 5 },
    { id: "stg_fx_confirm", workflowVersionId: version.id, code: "FX_CONFIRM", name: "تأكيد الصرف", order: 6 },
    { id: "stg_final", workflowVersionId: version.id, code: "FINAL", name: "الاعتماد النهائي", order: 7 },
    { id: "stg_closed", workflowVersionId: version.id, code: "CLOSED", name: "مغلق", order: 99, isFinal: true },
  ];
  store.stages.set(stages);

  const routingRules: StageRoutingRule[] = [
    sr(version.id, "stg_create", "bank", "team_entry", "rc_bank_intake", "تقديم الطلب"),
    sr(version.id, "stg_internal", "bank", "team_internal", "rc_bank_reviewer", "المراجعة الداخلية بالبنك"),
    sr(version.id, "stg_support", "committee", "team_support", "rc_support_member", "مراجعة اللجنة المساندة"),
    sr(version.id, "stg_exec", "committee", "team_exec", "rc_committee_manager", "قرار اللجنة التنفيذية"),
    sr(version.id, "stg_exec", "committee", "team_exec", "rc_executive_member", "اطلاع أعضاء اللجنة التنفيذية"),
    sr(version.id, "stg_fx", "bank", "team_fx", "rc_bank_swift", "تنفيذ عملية الصرف"),
    sr(version.id, "stg_fx_confirm", "committee", "team_fx_confirm", "rc_committee_manager", "تأكيد عملية الصرف"),
    sr(version.id, "stg_final", "committee", "team_exec", "rc_committee_manager", "الاعتماد النهائي"),
    sr(version.id, "stg_closed", "committee", "team_exec", "rc_committee_manager", "إغلاق الطلب"),
  ];
  store.stageRoutingRules.set(routingRules);

  // ---------- Transitions ----------
  const trans: WorkflowTransition[] = [
    t(version.id, "stg_create",      "stg_internal",   "APPROVE",       "اعتماد"),
    t(version.id, "stg_internal",    "stg_support",    "APPROVE",       "اعتماد"),
    t(version.id, "stg_internal",    "stg_create",     "REJECT",        "رفض وإرجاع للإدخال"),
    t(version.id, "stg_support",     "stg_exec",       "APPROVE",       "اعتماد"),
    t(version.id, "stg_support",     "stg_support",    "ADD_NOTES",     "إضافة ملاحظات"),
    t(version.id, "stg_exec",        "stg_fx",         "APPROVE",       "اعتماد"),
    t(version.id, "stg_exec",        "stg_closed",     "REJECT_FINAL",  "رفض نهائي"),
    t(version.id, "stg_fx",          "stg_fx_confirm", "APPROVE",       "اعتماد ورفع مستندات"),
    t(version.id, "stg_fx_confirm",  "stg_final",      "APPROVE",       "اعتماد"),
    t(version.id, "stg_fx_confirm",  "stg_fx",         "REJECT",        "رفض وإرجاع لعمليات الصرف"),
    t(version.id, "stg_final",       "stg_closed",     "FINAL_APPROVE", "اعتماد نهائي وإغلاق"),
    t(version.id, "stg_final",       "stg_fx_confirm", "REJECT",        "رفض وإرجاع للمرحلة السابقة"),
  ];
  store.transitions.set(trans);

  // ---------- Assignments ----------
  const assigns: StageAssignment[] = [
    a("stg_create",     { organizationId: "org_bank", teamId: "team_entry" }),
    a("stg_internal",   { organizationId: "org_bank", teamId: "team_internal" }),
    a("stg_support",    { organizationId: "org_committee", teamId: "team_support" }),
    a("stg_exec",       { organizationId: "org_committee", roleId: "role_exec_lead" }),
    a("stg_exec",       { organizationId: "org_committee", roleId: "role_exec_member", viewOnly: true }),
    a("stg_fx",         { organizationId: "org_bank", teamId: "team_fx" }),
    a("stg_fx_confirm", { organizationId: "org_committee", teamId: "team_fx_confirm" }),
    a("stg_final",      { organizationId: "org_committee", roleId: "role_exec_lead" }),
  ];
  store.assignments.set(assigns);

  // ---------- Field Groups (tabs on the request screen) ----------
  const groups: FieldGroup[] = [
    { id: "fg_basic", workflowVersionId: version.id, name: "المعلومات الأساسية", order: 1, system: true },
    { id: "fg_invoice", workflowVersionId: version.id, name: "بيانات الفاتورة", order: 2, system: true },
    { id: "fg_shipping", workflowVersionId: version.id, name: "بيانات الشحن", order: 3, system: true },
    { id: "fg_docs", workflowVersionId: version.id, name: "الوثائق المطلوبة", order: 4, system: true },
  ];
  store.fieldGroups.set(groups);

  // ---------- Field Definitions ----------
  const fields: FieldDefinition[] = [
    fd(version.id, "taxNumber", "الرقم الضريبي", "text", undefined, "fg_basic", undefined, true),
    fd(version.id, "importerName", "اسم التاجر", "dynamic_select", undefined, "fg_basic", "merchants", true),
    fd(version.id, "linkedCompany", "الشركة المرتبطة", "dynamic_select", undefined, "fg_basic", "merchant_companies", true),
    fd(version.id, "taxCardExpiry", "تاريخ انتهاء البطاقة الضريبية", "date", undefined, "fg_basic", undefined, true),
    fd(version.id, "commercialRegistration", "رقم السجل التجاري", "text", undefined, "fg_basic", undefined, true),
    fd(version.id, "commercialRegistrationExpiry", "تاريخ انتهاء السجل التجاري", "date", undefined, "fg_basic", undefined, true),
    fd(version.id, "owners", "الملاك والمساهمون (25% فأكثر)", "textarea", undefined, "fg_basic", undefined, true),

    fd(version.id, "requestType", "نوع الطلب", "select", ["طلب مصارفة وتحويل خارجي", "طلب تمويل واردات", "طلب اعتماد مستندي"], "fg_invoice", undefined, true),
    fd(version.id, "coverageType", "نوع التغطية", "select", ["اعتماد مستندي", "تحويل مباشر", "دفعة مقدمة"], "fg_invoice", undefined, true),
    fd(version.id, "foreignCurrencySource", "مصادر العملة الأجنبية", "select", ["حساب العميل", "موارد البنك", "مصدر خارجي"], "fg_invoice", undefined, true),
    fd(version.id, "paymentTerms", "شروط الدفع", "select", ["كلي", "جزئي"], "fg_invoice", undefined, true),
    fd(version.id, "requestCurrency", "عملة الطلب", "select", ["دولار أمريكي", "يورو", "ريال سعودي"], "fg_invoice", undefined, true),
    fd(version.id, "requestPercentage", "نسبة الطلب %", "number", undefined, "fg_invoice", undefined, true),
    fd(version.id, "invoiceType", "نوع الفاتورة", "select", ["فاتورة تجارية", "فاتورة أولية"], "fg_invoice", undefined, true),
    fd(version.id, "financeAmount", "إجمالي الطلب", "currency", undefined, "fg_invoice", undefined, true),
    fd(version.id, "currency", "عملة الفاتورة", "select", ["دولار أمريكي", "يورو", "ريال سعودي"], "fg_invoice", undefined, true),
    fd(version.id, "invoiceNumber", "رقم الفاتورة", "text", undefined, "fg_invoice", undefined, true),
    fd(version.id, "invoiceDate", "تاريخ الفاتورة", "date", undefined, "fg_invoice", undefined, true),
    fd(version.id, "quantity", "الكمية", "number", undefined, "fg_invoice", undefined, true),
    fd(version.id, "unit", "وحدة القياس", "text", undefined, "fg_invoice", undefined, true),
    fd(version.id, "invoiceTotal", "إجمالي الفاتورة", "currency", undefined, "fg_invoice", undefined, true),
    fd(version.id, "importType", "السلعة", "dynamic_select", undefined, "fg_invoice", "reference_data", true, "sector_activity"),
    fd(version.id, "supplierName", "اسم الشركة المصدرة", "text", undefined, "fg_invoice", undefined, true),
    fd(version.id, "supplierLocation", "موقع الشركة المصدرة", "text", undefined, "fg_invoice", undefined, true),
    fd(version.id, "originCountry", "بلد المنشأ", "dynamic_select", undefined, "fg_invoice", "reference_data", true, "origin_country"),

    fd(version.id, "shippingDate", "تاريخ الشحن", "date", undefined, "fg_shipping", undefined, true),
    fd(version.id, "arrivalDate", "تاريخ الوصول", "date", undefined, "fg_shipping", undefined, true),
    fd(version.id, "shippingPort", "ميناء الشحن", "text", undefined, "fg_shipping", undefined, true),
    fd(version.id, "arrivalPort", "ميناء الوصول", "dynamic_select", undefined, "fg_shipping", "reference_data", true, "arrival_port"),
    fd(version.id, "deliveryTerms", "شروط التسليم", "select", ["FOB", "CIF", "CFR"], "fg_shipping", undefined, true),
    fd(version.id, "finalDestination", "الوجهة النهائية", "text", undefined, "fg_shipping", undefined, true),

    fd(version.id, "docYemeniRialSharia", "كشف حساب بالريال اليمني (مناطق الشرعية)", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docSaudiRialSharia", "كشف حساب بالريال السعودي (مناطق الشرعية)", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docUsdSharia", "كشف حساب بالدولار الأمريكي (مناطق الشرعية)", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docTaxAndCr", "البطاقة الضريبية والسجل التجاري", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docCommercialInvoice", "الفاتورة", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docLicenses", "التراخيص المطلوبة لبعض السلع", "file", undefined, "fg_docs", undefined, true),
    fd(version.id, "docExtra", "مستندات إضافية", "file", undefined, "fg_docs", undefined, true),
  ];
  store.fieldDefs.set(fields);

  // ---------- Field Rules per stage ----------
  // Field key buckets used to compose per-stage visibility/edit rules.
  const requestKeys = fields.map((f) => f.key);
  const requiredOnCreate = [
    "taxNumber", "importerName", "linkedCompany", "taxCardExpiry", "commercialRegistration", "commercialRegistrationExpiry",
    "requestType", "coverageType", "foreignCurrencySource", "paymentTerms", "requestCurrency", "requestPercentage",
    "invoiceType", "financeAmount", "currency", "invoiceNumber", "invoiceDate", "quantity", "unit", "invoiceTotal",
    "importType", "supplierName", "supplierLocation", "originCountry",
    "shippingDate", "arrivalDate", "shippingPort", "arrivalPort", "deliveryTerms", "finalDestination",
    "docYemeniRialSharia", "docSaudiRialSharia", "docUsdSharia", "docTaxAndCr", "docCommercialInvoice",
  ];

  const rules: FieldRule[] = [];
  const allFields = fields.map((f) => f.key);

  // Stage: CREATE — default request design fields editable.
  requestKeys.forEach((k) =>
    rules.push(fr("stg_create", k, { visible: true, editable: true, required: requiredOnCreate.includes(k) })),
  );
  // Stage: INTERNAL and beyond — submitted request data is visible read-only.
  allFields.forEach((k) => {
    rules.push(fr("stg_internal", k, { visible: true, editable: false, required: false }));
  });

  // Stage: SUPPORT — request + internal readonly, committeeNotes editable.
  allFields.forEach((k) => {
    rules.push(fr("stg_support", k, { visible: true, editable: false, required: false }));
  });

  // Stage: EXEC — execDecisionNotes editable.
  allFields.forEach((k) => {
    rules.push(fr("stg_exec", k, { visible: true, editable: false, required: false }));
  });

  // Stage: FX — swift + fxRate editable.
  allFields.forEach((k) => {
    rules.push(fr("stg_fx", k, { visible: true, editable: false, required: false }));
  });

  // Stage: FX_CONFIRM — fxConfirmRef editable.
  allFields.forEach((k) => {
    rules.push(fr("stg_fx_confirm", k, { visible: true, editable: false, required: false }));
  });

  // Stage: FINAL + CLOSED — all readonly.
  allFields.forEach((k) => rules.push(fr("stg_final", k, { visible: true, editable: false, required: false })));
  allFields.forEach((k) => rules.push(fr("stg_closed", k, { visible: true, editable: false, required: false })));

  store.fieldRules.set(rules);

  // ---------- Sample workflow instances (the "current requests") ----------
  // الطلبات الحالية التي كانت في النظام القديم تُزرَع الآن كـ instances
  // تعمل بالكامل على محرّك سير العمل الجديد، موزّعة على كل المراحل.
  seedInstances(version.id);
}

// ============================================================
// Instance seeding
// ============================================================

/**
 * The linear forward path of the seeded "تمويل الواردات" workflow. Each entry
 * is the stage code plus the user who acts *while in that stage* (i.e. the one
 * who performs the transition that leaves it). Used to synthesize a realistic
 * history chain for every seeded request.
 */
const STAGE_PATH: { code: string; actorId: string }[] = [
  { code: "stg_create", actorId: "wu_entry" },
  { code: "stg_internal", actorId: "wu_reviewer" },
  { code: "stg_support", actorId: "wu_support" },
  { code: "stg_exec", actorId: "wu_exec_lead" },
  { code: "stg_fx", actorId: "wu_fx" },
  { code: "stg_fx_confirm", actorId: "wu_fx_confirm" },
  { code: "stg_final", actorId: "wu_exec_lead" },
  { code: "stg_closed", actorId: "wu_exec_lead" },
];

type InstanceSeed = {
  /** target current stage code */
  stage: string;
  status: WorkflowInstance["status"];
  data: Record<string, unknown>;
};

const SAMPLE_REQUESTS: InstanceSeed[] = [
  // ─── stg_create (مسودة / إنشاء) ─────────────────────────────────────
  inst("stg_create", "active", { importType: "مواد غذائية", importerName: "شركة هائل سعيد أنعم", financeAmount: 120000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Cargill Inc.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10000", arrivalPort: "ميناء عدن" }),
  inst("stg_create", "active", { importType: "قطع غيار", importerName: "مجموعة الشيباني", financeAmount: 340000, currency: "دولار أمريكي", paymentTerms: "تحويل مباشر", supplierName: "Siemens AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10011", arrivalPort: "ميناء الحديدة" }),

  // ─── stg_internal (المراجعة الداخلية) ───────────────────────────────
  inst("stg_internal", "active", { importType: "أدوية ومستلزمات طبية", importerName: "شركة ثابت إخوان", financeAmount: 510000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Pfizer Ltd.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10022", arrivalPort: "ميناء عدن" }),
  inst("stg_internal", "active", { importType: "أدوية ومستلزمات طبية", importerName: "شركة الكميم للأدوية", financeAmount: 89000, currency: "يورو", paymentTerms: "تحويل مباشر", supplierName: "Bayer AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10033", arrivalPort: "ميناء المكلا" }),

  // ─── stg_support (المراجعة المساندة) ────────────────────────────────
  inst("stg_support", "active", { importType: "مشتقات نفطية", importerName: "مجموعة الأهدل", financeAmount: 720000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Saudi Aramco Trading", originCountry: "السعودية", invoiceNumber: "INV-2026-10044", arrivalPort: "ميناء الحديدة" }),
  inst("stg_support", "active", { importType: "إلكترونيات", importerName: "شركة هائل سعيد أنعم", financeAmount: 145000, currency: "ريال سعودي", paymentTerms: "دفعة مقدمة", supplierName: "Siemens AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10055", arrivalPort: "منفذ الوديعة" }),

  // ─── stg_exec (القرار التنفيذي) ─────────────────────────────────────
  inst("stg_exec", "active", { importType: "مواد غذائية", importerName: "مجموعة الشيباني", financeAmount: 980000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Cargill Inc.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10066", arrivalPort: "ميناء عدن" }),
  inst("stg_exec", "active", { importType: "مواد بناء", importerName: "شركة ثابت إخوان", financeAmount: 230000, currency: "يورو", paymentTerms: "تحويل مباشر", supplierName: "Siemens AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10077", arrivalPort: "ميناء الحديدة" }),

  // ─── stg_fx (عمليات الصرف) ──────────────────────────────────────────
  inst("stg_fx", "active", { importType: "أدوية ومستلزمات طبية", importerName: "شركة الكميم للأدوية", financeAmount: 415000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Pfizer Ltd.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10088", arrivalPort: "ميناء المكلا" }),
  inst("stg_fx", "active", { importType: "مشتقات نفطية", importerName: "مجموعة الأهدل", financeAmount: 1250000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Saudi Aramco Trading", originCountry: "السعودية", invoiceNumber: "INV-2026-10099", arrivalPort: "ميناء عدن" }),

  // ─── stg_fx_confirm (تأكيد الصرف) ───────────────────────────────────
  inst("stg_fx_confirm", "active", { importType: "مواد غذائية", importerName: "شركة هائل سعيد أنعم", financeAmount: 640000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Cargill Inc.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10110", arrivalPort: "ميناء الحديدة" }),
  inst("stg_fx_confirm", "active", { importType: "مشتقات نفطية", importerName: "مجموعة الشيباني", financeAmount: 1100000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Saudi Aramco Trading", originCountry: "السعودية", invoiceNumber: "INV-2026-10121", arrivalPort: "ميناء عدن" }),

  // ─── stg_final (الاعتماد النهائي) ───────────────────────────────────
  inst("stg_final", "active", { importType: "إلكترونيات", importerName: "شركة ثابت إخوان", financeAmount: 420000, currency: "يورو", paymentTerms: "تحويل مباشر", supplierName: "Bayer AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10022", arrivalPort: "منفذ الوديعة" }),

  // ─── stg_closed (مكتمل — اعتماد نهائي) ──────────────────────────────
  inst("stg_closed", "closed", { importType: "مواد غذائية", importerName: "مجموعة الأهدل", financeAmount: 540000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Cargill Inc.", originCountry: "الولايات المتحدة", invoiceNumber: "INV-2026-10143", arrivalPort: "ميناء عدن" }),
  inst("stg_closed", "closed", { importType: "قطع غيار", importerName: "شركة الكميم للأدوية", financeAmount: 1280000, currency: "دولار أمريكي", paymentTerms: "تحويل مباشر", supplierName: "Siemens AG", originCountry: "ألمانيا", invoiceNumber: "INV-2026-10154", arrivalPort: "ميناء الحديدة" }),

  // ─── stg_closed (مرفوض نهائياً من اللجنة التنفيذية) ─────────────────
  inst("stg_closed", "rejected", { importType: "مشتقات نفطية", importerName: "شركة هائل سعيد أنعم", financeAmount: 980000, currency: "دولار أمريكي", paymentTerms: "اعتماد مستندي", supplierName: "Saudi Aramco Trading", originCountry: "السعودية", invoiceNumber: "INV-2026-10165", arrivalPort: "ميناء المكلا" }),
];

function seedInstances(versionId: string) {
  const instances: WorkflowInstance[] = [];
  const histories: WorkflowHistory[] = [];

  SAMPLE_REQUESTS.forEach((seed, idx) => {
    // Stagger creation dates so the lists/timelines look natural.
    const created = new Date(2026, 4, (idx % 27) + 1, 9, 0, 0);
    const instId = uid("inst");

    const { history, finalStageCode } = buildHistory(seed, instId, created);
    histories.push(...history);

    const last = history[history.length - 1];
    instances.push({
      id: instId,
      workflowVersionId: versionId,
      currentStageId: finalStageCode,
      status: seed.status,
      data: {
        ...seed.data,
        requestIdentifier: `IMP-2026-${String(2001 + idx).padStart(4, "0")}`,
      },
      createdBy: "wu_entry",
      createdAt: created.toISOString(),
      updatedAt: last.timestamp,
    });
  });

  // newest first (matches createInstance which prepends)
  store.instances.set([...instances].reverse());
  store.history.set([...histories].reverse());
}

/**
 * Builds the chain of history rows that walks a request from CREATE up to its
 * target stage following the seeded forward path. The rejected variant takes
 * the EXEC → CLOSED (رفض نهائي) branch instead of reaching it via FINAL.
 */
function buildHistory(seed: InstanceSeed, instanceId: string, created: Date) {
  const history: WorkflowHistory[] = [];
  const targetIdx = STAGE_PATH.findIndex((s) => s.code === seed.stage);
  let ts = created.getTime();
  const step = () => new Date((ts += 26 * 3600 * 1000)).toISOString(); // +~1 day per hop

  // initial creation entry
  history.push({
    id: uid("h"),
    workflowInstanceId: instanceId,
    fromStageId: null,
    toStageId: "stg_create",
    actionCode: "create",
    actionName: "إنشاء الطلب",
    performedBy: "wu_entry",
    timestamp: created.toISOString(),
  });

  // Rejected requests: walk create→internal→support→exec then exec→closed (رفض نهائي)
  if (seed.status === "rejected") {
    const execIdx = STAGE_PATH.findIndex((s) => s.code === "stg_exec");
    for (let i = 1; i <= execIdx; i++) {
      history.push(hop(instanceId, STAGE_PATH[i - 1], STAGE_PATH[i].code, "APPROVE", "اعتماد", step()));
    }
    history.push(hop(instanceId, STAGE_PATH[execIdx], "stg_closed", "REJECT_FINAL", "رفض نهائي", step()));
    return { history, finalStageCode: "stg_closed" };
  }

  // Forward path up to the target stage.
  for (let i = 1; i <= targetIdx; i++) {
    const from = STAGE_PATH[i - 1];
    const to = STAGE_PATH[i].code;
    const isFinalHop = to === "stg_closed";
    history.push(hop(
      instanceId, from, to,
      isFinalHop ? "FINAL_APPROVE" : "APPROVE",
      isFinalHop ? "اعتماد نهائي وإغلاق" : "اعتماد",
      step(),
    ));
  }

  return { history, finalStageCode: seed.stage };
}

// ---------- instance helpers ----------

function inst(stage: string, status: WorkflowInstance["status"], data: Record<string, unknown>): InstanceSeed {
  const { paymentTerms, ...requestData } = data;
  return {
    stage,
    status,
    data: enrichRequestData({
      ...requestData,
      coverageType: paymentTerms ?? "اعتماد مستندي",
      paymentTerms: "كلي",
    }),
  };
}

function hop(
  instanceId: string,
  from: { code: string; actorId: string },
  toStageId: string,
  actionCode: string,
  actionName: string,
  timestamp: string,
): WorkflowHistory {
  return {
    id: uid("h"),
    workflowInstanceId: instanceId,
    fromStageId: from.code,
    toStageId,
    actionCode,
    actionName,
    performedBy: from.actorId,
    timestamp,
  };
}

// ---------- helpers ----------

function t(versionId: string, from: string, to: string, code: string, name: string): WorkflowTransition {
  return { id: uid("t"), workflowVersionId: versionId, fromStageId: from, toStageId: to, actionCode: code, actionName: name };
}

function a(stageId: string, opts: Omit<StageAssignment, "id" | "stageId">): StageAssignment {
  return { id: uid("a"), stageId, ...opts };
}

function sr(
  workflowVersionId: string,
  stageId: string,
  organizationId: string,
  teamId: string,
  roleId: string,
  processLabel: string,
): StageRoutingRule {
  return { id: uid("sr"), workflowVersionId, stageId, organizationId, teamId, roleId, processLabel };
}

function fd(
  versionId: string,
  key: string,
  label: string,
  type: FieldDefinition["type"],
  options?: string[],
  groupId?: string,
  sourceTable?: FieldDefinition["sourceTable"],
  system = false,
  referenceTableKey?: string,
): FieldDefinition {
  return { id: uid("fd"), workflowVersionId: versionId, key, label, type, options, groupId, sourceTable, system, referenceTableKey };
}

function fr(stageId: string, fieldKey: string, opts: { visible: boolean; editable: boolean; required: boolean }): FieldRule {
  return { id: uid("fr"), stageId, fieldKey, ...opts };
}

function merchantFixture(name: string): {
  taxNumber: string;
  linkedCompany: string;
  taxCardExpiry: string;
  commercialRegistration: string;
  commercialRegistrationExpiry: string;
  owners: string;
} | undefined {
  switch (name) {
    case "شركة هائل سعيد أنعم":
      return { taxNumber: "4100000", linkedCompany: "شركة هائل سعيد أنعم للتجارة", taxCardExpiry: "2026-06-16", commercialRegistration: "CR-50000", commercialRegistrationExpiry: "2026-06-16", owners: "عبد الجليل هائل سعيد - 25%" };
    case "مجموعة الشيباني":
      return { taxNumber: "4107777", linkedCompany: "الشيباني للاستيراد", taxCardExpiry: "2026-06-16", commercialRegistration: "CR-50013", commercialRegistrationExpiry: "2026-06-16", owners: "أحمد الشيباني - 25%" };
    case "شركة ثابت إخوان":
      return { taxNumber: "4115554", linkedCompany: "ثابت إخوان للتجارة", taxCardExpiry: "2026-06-16", commercialRegistration: "CR-50026", commercialRegistrationExpiry: "2026-06-16", owners: "محمد ثابت - 25%" };
    case "شركة الكميم للأدوية":
      return { taxNumber: "4123331", linkedCompany: "الكميم للأدوية", taxCardExpiry: "2026-06-16", commercialRegistration: "CR-50039", commercialRegistrationExpiry: "2026-06-16", owners: "علي الكميم - 25%" };
    case "مجموعة الأهدل":
      return { taxNumber: "4131108", linkedCompany: "الأهدل للتجارة", taxCardExpiry: "2026-06-16", commercialRegistration: "CR-50052", commercialRegistrationExpiry: "2026-06-16", owners: "سالم الأهدل - 25%" };
    default:
      return undefined;
  }
}

function enrichRequestData(data: Record<string, unknown>): Record<string, unknown> {
  const importerName = typeof data.importerName === "string" ? data.importerName : "";
  const merchant = merchantFixture(importerName);
  return {
    requestType: "طلب مصارفة وتحويل خارجي",
    coverageType: "اعتماد مستندي",
    foreignCurrencySource: "حساب العميل",
    paymentTerms: "كلي",
    requestCurrency: data.currency ?? "دولار أمريكي",
    requestPercentage: 100,
    invoiceType: "فاتورة تجارية",
    invoiceDate: "2026-06-16",
    quantity: 1,
    unit: "كرتون",
    invoiceTotal: data.financeAmount ?? 0,
    supplierLocation: "المدينة / الدولة",
    shippingDate: "2026-06-16",
    arrivalDate: "2026-06-16",
    shippingPort: "ميناء الشحن",
    deliveryTerms: "CIF",
    finalDestination: "المدينة / المخزن الوجهة",
    ...(merchant ?? {}),
    ...data,
  };
}
