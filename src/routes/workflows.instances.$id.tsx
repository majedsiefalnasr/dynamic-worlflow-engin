import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  MessageSquare,
  Download,
  User as UserIcon,
  Building2,
  MapPin,
  CalendarDays,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DynamicForm, type DynamicField } from "@/components/workflow/DynamicForm";
import { OrgProcessStepper } from "@/components/workflow/OrgProcessStepper";
import {
  wfStore,
  getInitialStage,
  getStageFields,
  getViewerFields,
  getFieldGroups,
  getFieldDefs,
  getAvailableActions,
  applyAction,
  saveDraftData,
  getInstanceHistory,
  canExecute,
  canView,
} from "@/lib/workflow-engine";
import { useWfUser } from "@/lib/workflow-engine/wfAuth";
import { useAuth } from "@/lib/mock";
import {
  canScreen,
  progressForInstance,
  instanceRef,
  instanceTitle,
  instanceGoodsType,
  instanceAmount,
  instanceCurrency,
  instanceInvoiceNumber,
  isDuplicateInvoice,
  stageLabel,
} from "@/lib/workflow-bridge";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";
import { toast } from "sonner";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import {
  useRequestDetailQuery,
  useRequestHistoryQuery,
  useRequestMutations,
  useWorkflowStagesQuery,
  useRequestsQuery,
} from "@/lib/api/requests";
import { useMerchantsQuery } from "@/lib/api/merchants";

export const Route = createFileRoute("/workflows/instances/$id")({
  component: () => (
    <ScreenGuard screen="requests">
      <InstancePage />
    </ScreenGuard>
  ),
});

function InstancePage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const requestsApi = isApiEnabled("requests");
  const isNew = id === "new";
  const detailQuery = useRequestDetailQuery(id, requestsApi && !isNew);
  const historyQuery = useRequestHistoryQuery(id, requestsApi && !isNew);
  const allRequestsQuery = useRequestsQuery(requestsApi);
  const mutations = useRequestMutations();
  const cellInstances = wfStore.instances.use();
  const cellStages = wfStore.stages.use();
  const users = wfStore.users.use();
  const orgs = wfStore.orgs.use();
  const defs = wfStore.definitions.use();
  const versions = wfStore.versions.use();
  wfStore.history.use();
  wfStore.fieldRules.use();
  wfStore.fieldDefs.use();
  wfStore.fieldGroups.use();
  wfStore.assignments.use();
  const user = useWfUser();
  const { user: legacyUser } = useAuth();
  const isAdmin = legacyUser?.roleId === "rc_platform_admin";
  const canActOnRequests = canScreen(legacyUser, "requests", "edit");
  const merchantsQuery = useMerchantsQuery(requestsApi && isNew);

  const publishedVer = defs[0]
    ? versions.find((v) => v.workflowId === defs[0].id && v.isPublished)
    : undefined;
  const initialStage = publishedVer ? getInitialStage(publishedVer.id) : undefined;

  const newInstance = useMemo<typeof detailQuery.data | undefined>(() => {
    if (!isNew || !publishedVer || !initialStage) return undefined;
    return {
      id: "new",
      workflowVersionId: publishedVer.id,
      currentStageId: initialStage.id,
      status: "active" as const,
      data: {},
      createdBy: legacyUser?.id ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _version: 0,
      _merchantName: "",
      _stageName: initialStage.name,
      _bankName: "",
      _createdByName: legacyUser?.name ?? "",
    };
  }, [isNew, publishedVer, initialStage, legacyUser]);

  const detailData = isNew ? newInstance : detailQuery.data;
  const instance = isNew
    ? newInstance
    : requestsApi
      ? detailData && detailData.id && detailData.id !== "null"
        ? { ...detailData }
        : undefined
      : cellInstances.find((i) => i.id === id);

  const apiVersionId = instance?.workflowVersionId;
  const stagesQuery = useWorkflowStagesQuery(apiVersionId, requestsApi && !isNew);
  const stages = requestsApi
    ? cellStages.length > 0
      ? cellStages
      : (stagesQuery.data ?? [])
    : cellStages;
  const stage = instance ? stages.find((s) => s.id === instance.currentStageId) : undefined;

  // Resolve execute permission from live assignments in both modes. `user` is
  // the engine WfUser (synthesized from the live auth user via wfAuth); live
  // assignments use backend role/team/org ids which the synthesized user carries.
  const isExecutor = isNew
    ? true
    : (user ? canExecute(instance?.currentStageId ?? "", user) : false) || isAdmin;

  const stageFields: DynamicField[] = useMemo(() => {
    if (!instance) return [];
    if (isNew || isExecutor || isAdmin)
      return getStageFields(instance.workflowVersionId, instance.currentStageId);
    return getViewerFields(instance.workflowVersionId, user);
  }, [instance, isNew, isExecutor, isAdmin, user]);

  const fieldGroups = useMemo(() => {
    if (!instance) return [];
    return getFieldGroups(instance.workflowVersionId);
  }, [instance]);

  const [draftData, setDraftData] = useState<Record<string, unknown>>(instance?.data ?? {});
  const [comments, setComments] = useState("");

  // Re-hydrate the local draft whenever the underlying request changes identity
  // (navigating to a different request, or the server advancing it to a new
  // stage/version after a draft save or action). Keyed on id+version so user
  // edits between saves are not clobbered on re-render.
  const instanceVersion = requestsApi
    ? (instance as { _version?: number })?._version
    : instance?.updatedAt;
  const lastLoadedKey = useRef<string>("");
  useEffect(() => {
    if (!instance) return;
    const key = `${instance.id}:${instanceVersion ?? ""}`;
    if (key === lastLoadedKey.current) return;
    lastLoadedKey.current = key;
    setDraftData(instance.data);
  }, [instance, instanceVersion]);

  if (requestsApi && !isNew && detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        جارٍ تحميل الطلب…
      </div>
    );
  }

  if (requestsApi && !isNew && detailQuery.error) {
    return (
      <div>
        <PageHeader
          title="خطأ"
          actions={
            <Link to="/workflows">
              <Button variant="outline">رجوع</Button>
            </Link>
          }
        />
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {detailQuery.error instanceof ApiError
              ? detailQuery.error.message
              : "تعذّر تحميل الطلب"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => detailQuery.refetch()}
            className="mt-4"
          >
            إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div>
        <PageHeader
          title="الطلب غير موجود"
          actions={
            <Link to="/workflows">
              <Button variant="outline">رجوع</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // New requests have no transitions yet; existing requests compute available
  // actions from live-loaded wfStore.transitions/assignments.
  const actions = isNew ? [] : user ? getAvailableActions(instance, user) : [];
  const canSeeStage = isAdmin || isNew || canView(instance.currentStageId, user);
  // Executors of an existing request may edit its draft fields in API mode too
  // (saveDraft mutation persists them); viewers stay read-only.
  const canEditFields = isNew || (requestsApi ? isExecutor && canActOnRequests : false);
  const showActionPanel = !isNew && canSeeStage && isExecutor && canActOnRequests;
  const history = requestsApi ? (historyQuery.data ?? []) : getInstanceHistory(instance.id);

  const apiStageName = requestsApi
    ? (stage?.name ?? (detailData as { _stageName?: string })?._stageName ?? "—")
    : undefined;

  const progressOf = () => {
    if (requestsApi) {
      const ordered = stages.filter((s) => s.order < 99).sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((s) => s.id === instance.currentStageId);
      if (idx < 0) return instance.status === "closed" ? 100 : 0;
      return ordered.length ? Math.round(((idx + 1) / ordered.length) * 100) : 0;
    }
    return progressForInstance(instance);
  };
  const progress = progressOf();

  const currentStageLabel = apiStageName ?? stageLabel(instance);

  const creator = users.find((u) => u.id === instance.createdBy);
  const creatorOrg = orgs.find((o) => o.id === creator?.organizationId);
  const apiMerchantName = requestsApi
    ? (detailData as { _merchantName?: string })?._merchantName
    : undefined;

  const allInstances = requestsApi ? (allRequestsQuery.data ?? []) : undefined;
  const duplicateInvoice = isDuplicateInvoice(draftData, instance.id, allInstances);

  const onSaveDraft = async () => {
    if (!user || !instance) return;
    if (requestsApi) {
      try {
        await mutations.saveDraft.mutateAsync({
          id: instance.id,
          version: (instance as { _version?: number })._version ?? 0,
          data: draftData,
        });
        toast.success("تم حفظ المسودة");
        detailQuery.refetch();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "تعذّر حفظ المسودة");
      }
      return;
    }
    // Mock path (existing)
    saveDraftData(instance.id, draftData, user);
    toast.success("تم حفظ المسودة");
  };

  const onAction = async (transitionId: string, actionName: string) => {
    if (!user) return toast.error("اختر مستخدمًا");
    if (requestsApi && instance) {
      try {
        await mutations.executeAction.mutateAsync({
          id: instance.id,
          transitionId: Number(transitionId),
          version: (instance as { _version?: number })._version ?? 0,
          comment: comments || undefined,
          data: draftData,
        });
        toast.success(`تم تنفيذ: ${actionName}`);
        setComments("");
        detailQuery.refetch();
        historyQuery.refetch();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "تعذّر تنفيذ الإجراء");
      }
      return;
    }
    // Mock path (existing)
    const res = applyAction({
      instanceId: instance.id,
      transitionId,
      user,
      comments,
      data: draftData,
    });
    if (!res.ok) return toast.error(res.error);
    toast.success(`تم تنفيذ: ${actionName}`);
    setComments("");
  };

  const onDownload = () => {
    const defs = requestsApi ? [] : getFieldDefs(instance.workflowVersionId);
    const fieldsLabeled: Record<string, unknown> = {};
    if (requestsApi) {
      Object.entries(instance.data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") fieldsLabeled[k] = v;
      });
    } else {
      defs.forEach((d) => {
        const v = instance.data[d.key];
        if (v !== undefined && v !== null && v !== "") fieldsLabeled[d.label] = v;
      });
    }
    const payload = {
      "رقم الطلب": instanceRef(instance),
      المستورد: instanceTitle(instance),
      "المرحلة الحالية": currentStageLabel,
      الحالة:
        instance.status === "active" ? "نشط" : instance.status === "closed" ? "مغلق" : "مرفوض",
      "تاريخ الإنشاء": new Date(instance.createdAt).toLocaleString("ar"),
      البيانات: fieldsLabeled,
      "سجل الإجراءات": history.map((h) => ({
        الإجراء: h.actionName,
        المنفذ: users.find((u) => u.id === h.performedBy)?.fullName ?? h.performedBy,
        الوقت: new Date(h.timestamp).toLocaleString("ar"),
        ملاحظات: h.comments ?? "",
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `request-${instanceRef(instance)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تنزيل الطلب");
  };

  return (
    <div>
      <PageHeader
        title={instanceRef(instance)}
        subtitle={`${instanceTitle(instance)} · ${instanceGoodsType(instance)}`}
        breadcrumbs={[
          { label: "الرئيسية", to: "/" },
          { label: "الطلبات", to: "/workflows" },
          { label: instanceRef(instance) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onDownload}>
              <Download className="ms-1 h-4 w-4" /> تنزيل الطلب
            </Button>
            <Button variant="outline" onClick={() => nav({ to: "/workflows" })}>
              <ArrowLeft className="ms-1 h-4 w-4" /> رجوع للقائمة
            </Button>
          </div>
        }
      />

      {duplicateInvoice.duplicate && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">تنبيه: فاتورة مكررة محتملة</div>
            <p className="mt-1 text-sm leading-6 text-foreground">
              رقم الفاتورة{" "}
              <span className="font-mono font-semibold">{instanceInvoiceNumber(instance)}</span> ظهر
              في طلبات سابقة: {duplicateInvoice.refs.join("، ")}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Progress */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">تقدم الطلب في الدورة التنظيمية</h2>
              <span className="text-lg font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground mt-2">
              المرحلة الحالية: {currentStageLabel}
            </p>
          </Card>

          {/* Stage banner */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">المرحلة الحالية</div>
                  <div className="text-lg font-bold">{currentStageLabel}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={instance.status === "active" ? "default" : "secondary"}>
                  {instance.status === "active"
                    ? "نشط"
                    : instance.status === "closed"
                      ? "مغلق"
                      : "مرفوض"}
                </Badge>
                {isAdmin && (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> مسؤول النظام
                  </Badge>
                )}
                {!isAdmin && !isExecutor && (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" /> عرض فقط
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Form */}
          <Card id="request-data" className="p-5">
            <h2 className="font-semibold mb-4">بيانات الطلب</h2>
            {stageFields.length > 0 ? (
              <DynamicForm
                fields={stageFields}
                value={draftData}
                onChange={setDraftData}
                groups={fieldGroups}
                readOnly={!canEditFields}
              />
            ) : (
              <ApiDataView data={instance.data} />
            )}
          </Card>

          {/* Create submit */}
          {isNew && requestsApi && (
            <Card className="p-5">
              <h2 className="font-semibold mb-4">تقديم الطلب</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={mutations.create.isPending}
                  onClick={async () => {
                    if (!publishedVer || !legacyUser) return;
                    const merchants = merchantsQuery.data ?? [];
                    const merchant = merchants.find((m) => m.name === draftData.importerName);
                    if (!merchant) return toast.error("اختر التاجر أولًا");
                    try {
                      const result = await mutations.create.mutateAsync({
                        workflowVersionId: Number(publishedVer.id),
                        bankId: Number(legacyUser.entityId ?? 0),
                        merchantId: Number(merchant.id),
                        amount: Number(draftData.financeAmount) || undefined,
                        currency:
                          typeof draftData.currency === "string" ? draftData.currency : undefined,
                        invoiceNumber:
                          typeof draftData.invoiceNumber === "string"
                            ? draftData.invoiceNumber
                            : undefined,
                        data: draftData,
                      });
                      toast.success("تم إنشاء الطلب");
                      const newId = (result as { id?: number })?.id;
                      if (newId)
                        nav({ to: "/workflows/instances/$id", params: { id: String(newId) } });
                      else nav({ to: "/workflows" });
                    } catch (error) {
                      toast.error(error instanceof ApiError ? error.message : "تعذّر إنشاء الطلب");
                    }
                  }}
                >
                  {mutations.create.isPending ? "جارٍ الإنشاء..." : "تقديم الطلب"}
                </Button>
                <Button variant="outline" onClick={() => nav({ to: "/workflows" })}>
                  إلغاء
                </Button>
              </div>
            </Card>
          )}

          {/* Actions */}
          {showActionPanel && (
            <Card className="p-5">
              <h2 className="font-semibold mb-4">الإجراءات المتاحة</h2>
              <div className="space-y-1.5 mb-4">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> ملاحظات (اختيارية)
                </label>
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={onSaveDraft}>
                  حفظ المسودة
                </Button>
                {actions.length === 0 && (
                  <span className="text-xs text-muted-foreground self-center">
                    لا توجد انتقالات معرَّفة لهذه المرحلة.
                  </span>
                )}
                {actions.map((a) => {
                  const isReject = /REJECT/i.test(a.actionCode);
                  return (
                    <Button
                      key={a.id}
                      variant={isReject ? "destructive" : "default"}
                      onClick={() => onAction(a.id, a.actionName)}
                    >
                      {a.actionName}
                    </Button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Organizational process */}
          <Card className="p-5">
            <h2 className="font-semibold mb-4">سير العملية التنظيمية</h2>
            <OrgProcessStepper instance={instance} apiStages={requestsApi ? stages : undefined} />
          </Card>

          {/* Quick info */}
          <Card className="p-5">
            <h2 className="font-semibold mb-4">معلومات سريعة</h2>
            <dl className="space-y-3">
              <QuickRow
                icon={<UserIcon className="h-4 w-4" />}
                label="مقدم الطلب"
                value={apiMerchantName || instanceTitle(instance)}
              />
              <QuickRow
                icon={<Building2 className="h-4 w-4" />}
                label="الجهة"
                value={
                  creatorOrg?.name ||
                  (requestsApi ? ((detailData as { _bankName?: string })?._bankName ?? "—") : "—")
                }
              />
              <QuickRow
                icon={<MapPin className="h-4 w-4" />}
                label="الميناء"
                value={String(instance.data.arrivalPort ?? "—")}
              />
              <QuickRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="التقديم"
                value={new Date(instance.createdAt).toLocaleDateString("ar")}
              />
              <QuickRow
                icon={<Activity className="h-4 w-4" />}
                label="المبلغ"
                value={`${instanceCurrency(instance)} ${instanceAmount(instance).toLocaleString("en-US")}`}
              />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

const DATA_LABELS: Record<string, string> = {
  requestIdentifier: "رقم المعرّف",
  importerName: "المستورد",
  importType: "نوع البضاعة",
  financeAmount: "المبلغ",
  currency: "العملة",
  invoiceNumber: "رقم الفاتورة",
  invoiceDate: "تاريخ الفاتورة",
  supplierName: "المورد",
  originCountry: "بلد المنشأ",
  arrivalPort: "ميناء الوصول",
  shippingPort: "ميناء الشحن",
  paymentTerms: "شروط الدفع",
  goodsDescription: "وصف البضاعة",
  taxNumber: "الرقم الضريبي",
  linkedCompany: "الشركة المرتبطة",
  commercialRegistration: "السجل التجاري",
  owners: "الملاك",
};

function ApiDataView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs text-muted-foreground">{DATA_LABELS[key] ?? key}</dt>
          <dd className="text-sm font-medium mt-0.5">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function QuickRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`text-sm font-medium truncate ${valueClass ?? ""}`}>{value}</dd>
      </div>
    </div>
  );
}
