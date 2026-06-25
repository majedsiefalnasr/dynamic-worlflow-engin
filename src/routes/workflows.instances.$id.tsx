import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ShieldCheck, Lock, MessageSquare, Download,
  User as UserIcon, Building2, MapPin, CalendarDays, Activity, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  DynamicForm, type DynamicField,
} from "@/components/workflow/DynamicForm";
import { OrgProcessStepper } from "@/components/workflow/OrgProcessStepper";
import {
  wfStore, getStageFields, getViewerFields, getFieldGroups, getFieldDefs, getAvailableActions,
  applyAction, saveDraftData, getInstanceHistory, canExecute, canView,
} from "@/lib/workflow-engine";
import { useWfUser } from "@/lib/workflow-engine/wfAuth";
import { useAuth } from "@/lib/mock";
import {
  canScreen, progressForInstance, instanceRef, instanceTitle,
  instanceGoodsType, instanceAmount, instanceCurrency, instanceInvoiceNumber, isDuplicateInvoice,
  stageLabel,
} from "@/lib/workflow-bridge";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";
import { toast } from "sonner";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useRequestDetailQuery, useRequestHistoryQuery, useRequestMutations } from "@/lib/api/requests";

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
  const detailQuery = useRequestDetailQuery(id, requestsApi);
  const historyQuery = useRequestHistoryQuery(id, requestsApi);
  const mutations = useRequestMutations();
  const instances = wfStore.instances.use();
  const stages = wfStore.stages.use();
  const users = wfStore.users.use();
  const orgs = wfStore.orgs.use();
  wfStore.history.use();
  wfStore.fieldRules.use();
  wfStore.fieldDefs.use();
  wfStore.fieldGroups.use();
  wfStore.assignments.use();
  const user = useWfUser();
  const { user: legacyUser } = useAuth();
  const isAdmin = legacyUser?.roleId === "rc_platform_admin";
  const canActOnRequests = canScreen(legacyUser, "requests", "edit");

  // Live path: instance from API detail query
  // Mock path: instance from wfStore (existing behavior)
  const instance = requestsApi
    ? (detailQuery.data ? { ...detailQuery.data } : undefined)
    : instances.find((i) => i.id === id);
  const stage = instance ? stages.find((s) => s.id === instance.currentStageId) : undefined;

  const isExecutor = user ? canExecute(instance?.currentStageId ?? "", user) : false;

  const stageFields: DynamicField[] = useMemo(() => {
    if (!instance) return [];
    if (isExecutor || isAdmin) return getStageFields(instance.workflowVersionId, instance.currentStageId);
    return getViewerFields(instance.workflowVersionId, user);
  }, [instance, isExecutor, isAdmin, user]);

  const fieldGroups = useMemo(() => {
    if (!instance) return [];
    return getFieldGroups(instance.workflowVersionId);
  }, [instance]);

  const [draftData, setDraftData] = useState<Record<string, unknown>>(instance?.data ?? {});
  const [comments, setComments] = useState("");

  if (requestsApi && detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        جارٍ تحميل الطلب…
      </div>
    );
  }

  if (requestsApi && detailQuery.error) {
    return (
      <div>
        <PageHeader title="خطأ" actions={<Link to="/workflows"><Button variant="outline">رجوع</Button></Link>} />
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {detailQuery.error instanceof ApiError ? detailQuery.error.message : "تعذّر تحميل الطلب"}
          </p>
          <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()} className="mt-4">
            إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  if (!instance) {
    return (
      <div>
        <PageHeader title="الطلب غير موجود" actions={<Link to="/workflows"><Button variant="outline">رجوع</Button></Link>} />
      </div>
    );
  }

  const actions = user ? getAvailableActions(instance, user) : [];
  // مسؤول النظام يرى كل الطلبات في كل المراحل بدون قيد على التعيينات.
  const canSeeStage = isAdmin || canView(instance.currentStageId, user);
  // تعديل الحقول مسموح فقط لمن يملك صلاحية التنفيذ على المرحلة + صلاحية شاشة الطلبات.
  const canEditFields = isExecutor && canActOnRequests;
  const showActionPanel = canSeeStage && isExecutor && canActOnRequests;
  const history = requestsApi
    ? (historyQuery.data ?? [])
    : getInstanceHistory(instance.id);

  const progress = progressForInstance(instance);
  const creator = users.find((u) => u.id === instance.createdBy);
  const creatorOrg = orgs.find((o) => o.id === creator?.organizationId);

  // sync draft to instance when stage changes
  if (Object.keys(draftData).length === 0 && Object.keys(instance.data).length > 0) {
    setDraftData(instance.data);
  }

  const duplicateInvoice = isDuplicateInvoice(draftData, instance.id);

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
    const res = applyAction({ instanceId: instance.id, transitionId, user, comments, data: draftData });
    if (!res.ok) return toast.error(res.error);
    toast.success(`تم تنفيذ: ${actionName}`);
    setComments("");
  };

  const onDownload = () => {
    const defs = getFieldDefs(instance.workflowVersionId);
    const fieldsLabeled: Record<string, unknown> = {};
    defs.forEach((d) => {
      const v = instance.data[d.key];
      if (v !== undefined && v !== null && v !== "") fieldsLabeled[d.label] = v;
    });
    const payload = {
      "رقم الطلب": instanceRef(instance),
      "المستورد": instanceTitle(instance),
      "المرحلة الحالية": stageLabel(instance),
      "الحالة": instance.status === "active" ? "نشط" : instance.status === "closed" ? "مغلق" : "مرفوض",
      "تاريخ الإنشاء": new Date(instance.createdAt).toLocaleString("ar"),
      "البيانات": fieldsLabeled,
      "سجل الإجراءات": history.map((h) => ({
        الإجراء: h.actionName,
        المنفذ: users.find((u) => u.id === h.performedBy)?.fullName ?? h.performedBy,
        الوقت: new Date(h.timestamp).toLocaleString("ar"),
        ملاحظات: h.comments ?? "",
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
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
              رقم الفاتورة <span className="font-mono font-semibold">{instanceInvoiceNumber(instance)}</span>
              {" "}ظهر في طلبات سابقة: {duplicateInvoice.refs.join("، ")}.
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
            <p className="text-xs text-muted-foreground mt-2">المرحلة الحالية: {stageLabel(instance)}</p>
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
                  <div className="text-lg font-bold">{stageLabel(instance)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={instance.status === "active" ? "default" : "secondary"}>
                  {instance.status === "active" ? "نشط" : instance.status === "closed" ? "مغلق" : "مرفوض"}
                </Badge>
                {isAdmin && (
                  <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> مسؤول النظام</Badge>
                )}
                {!isAdmin && !isExecutor && (
                  <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> عرض فقط</Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Form */}
          <Card id="request-data" className="p-5">
            <h2 className="font-semibold mb-4">بيانات الطلب</h2>
            <DynamicForm fields={stageFields} value={draftData} onChange={setDraftData} groups={fieldGroups} readOnly={!canEditFields} />
          </Card>

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
                <Button variant="secondary" onClick={onSaveDraft}>حفظ المسودة</Button>
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
            <OrgProcessStepper instance={instance} />
          </Card>

          {/* Quick info */}
          <Card className="p-5">
            <h2 className="font-semibold mb-4">معلومات سريعة</h2>
            <dl className="space-y-3">
              <QuickRow icon={<UserIcon className="h-4 w-4" />} label="أنشأ الطلب" value={creator?.fullName ?? "—"} />
              <QuickRow icon={<Building2 className="h-4 w-4" />} label="الجهة" value={creatorOrg?.name ?? "—"} />
              <QuickRow icon={<MapPin className="h-4 w-4" />} label="الميناء" value={String(instance.data.arrivalPort ?? "—")} />
              <QuickRow icon={<CalendarDays className="h-4 w-4" />} label="التقديم" value={new Date(instance.createdAt).toLocaleDateString("ar")} />
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

function QuickRow({
  icon, label, value, valueClass,
}: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`text-sm font-medium truncate ${valueClass ?? ""}`}>{value}</dd>
      </div>
    </div>
  );
}
