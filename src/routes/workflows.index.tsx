import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, Search, Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createInstance,
  getInitialStage,
  getPublishedVersion,
  wfStore,
} from "@/lib/workflow-engine";
import { useAuth } from "@/lib/mock";
import {
  getWorkflowUser,
  instanceAmount,
  instanceCurrency,
  instanceGoodsType,
  instanceInvoiceNumber,
  instanceRef,
  instanceTitle,
  roleCanCreateRequest,
  isDuplicateInvoice,
  visibleInstancesFor,
} from "@/lib/workflow-bridge";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";
import { toast } from "sonner";
import { ApiError, isApiEnabled } from "@/lib/api/client";
import { useRequestsQuery, useRequestMutations, useWorkflowStagesQuery } from "@/lib/api/requests";
import { useBanksQuery } from "@/lib/api/banks";
import { useMerchantsQuery } from "@/lib/api/merchants";

export const Route = createFileRoute("/workflows/")({
  component: () => (
    <ScreenGuard screen="requests">
      <WorkflowsHome />
    </ScreenGuard>
  ),
});

function WorkflowsHome() {
  const nav = useNavigate();
  const { user } = useAuth();
  const requestsApi = isApiEnabled("requests");
  const defs = wfStore.definitions.use();
  const cellInstances = wfStore.instances.use();
  const cellStages = wfStore.stages.use();
  wfStore.versions.use();

  const reqQuery = useRequestsQuery(requestsApi);
  const apiInstances = reqQuery.data ?? [];
  const apiVersionId = apiInstances[0]?.workflowVersionId;
  const stagesQuery = useWorkflowStagesQuery(apiVersionId, requestsApi);

  const instances = requestsApi ? apiInstances : cellInstances;
  const stages = requestsApi ? (stagesQuery.data ?? []) : cellStages;

  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [openCreate, setOpenCreate] = useState(false);

  const selectedDef = defs[0];
  const publishedVer = selectedDef ? getPublishedVersion(selectedDef.id) : undefined;
  // The API returns only requests the user may see; mock filters client-side.
  const scoped = requestsApi ? instances : visibleInstancesFor(user, instances);

  const stageNameOf = (id: string) => stages.find((s) => s.id === id)?.name ?? "—";
  const progressOf = (inst: (typeof instances)[number]) => {
    const ordered = stages.filter((s) => s.order < 99).sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((s) => s.id === inst.currentStageId);
    if (idx < 0) return inst.status === "closed" ? 100 : 0;
    return ordered.length ? Math.round(((idx + 1) / ordered.length) * 100) : 0;
  };

  const data = useMemo(() => {
    return scoped.filter((inst) => {
      const haystack = [
        instanceRef(inst),
        instanceTitle(inst),
        instanceGoodsType(inst),
        String(inst.data.invoiceNumber ?? ""),
      ].join(" ");
      return (
        (stageFilter === "all" || inst.currentStageId === stageFilter) &&
        (!q || haystack.includes(q))
      );
    });
  }, [scoped, q, stageFilter]);

  const stageOptions = stages
    .filter((s) => (publishedVer ? s.workflowVersionId === publishedVer.id : true))
    .sort((a, b) => a.order - b.order);

  const onCreate = () => {
    if (!user) return toast.error("سجّل الدخول أولًا");
    if (!roleCanCreateRequest(user)) return toast.error("لا تملك صلاحية إنشاء طلب");
    if (!publishedVer) return toast.error("لا توجد نسخة منشورة");

    const wfUser = getWorkflowUser(user);
    if (!wfUser) return toast.error("المستخدم غير مربوط بمحرّك سير العمل");

    const initial = getInitialStage(publishedVer.id);
    if (!initial) return toast.error("لا توجد مرحلة مبدئية");

    const inst = createInstance({ workflowVersionId: publishedVer.id, user: wfUser });
    toast.success("تم إنشاء طلب جديد");
    nav({ to: "/workflows/instances/$id", params: { id: inst.id } });
  };

  return (
    <div>
      <PageHeader
        title="الطلبات"
        subtitle="القائمة التشغيلية تعمل بالكامل من محرّك سير العمل الديناميكي."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "الطلبات" }]}
        actions={
          <>
            {user?.roleId === "rc_platform_admin" && (
              <Link to="/admin/workflows" className="inline-block">
                <Button variant="outline">
                  <Workflow className="ms-1 h-4 w-4" /> مصمم سير العمل
                </Button>
              </Link>
            )}
            {!requestsApi && user && roleCanCreateRequest(user) && (
              <Button onClick={onCreate} disabled={!publishedVer}>
                <FilePlus2 className="ms-1 h-4 w-4" /> طلب جديد
              </Button>
            )}
            {requestsApi && (
              <Button onClick={() => setOpenCreate(true)} disabled={!publishedVer}>
                <FilePlus2 className="ms-1 h-4 w-4" /> طلب جديد
              </Button>
            )}
          </>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم الفاتورة، مقدم الطلب، أو نوع البضاعة..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="المرحلة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المراحل</SelectItem>
              {stageOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">طلبات سير العمل</h2>
          <Badge variant="secondary">{data.length}</Badge>
        </div>
        {data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            لا توجد طلبات مطابقة.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم المعرّف</TableHead>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>مقدم الطلب</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>المرحلة الحالية</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التقدم</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">
                    {instanceRef(inst)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{instanceInvoiceNumber(inst)}</span>
                      {isDuplicateInvoice(inst.data, inst.id).duplicate && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          مكرر
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{instanceTitle(inst)}</TableCell>
                  <TableCell className="text-xs">{instanceGoodsType(inst)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {instanceAmount(inst).toLocaleString("en-US")}
                    <span className="text-xs text-muted-foreground mr-1">
                      {instanceCurrency(inst)}
                    </span>
                  </TableCell>
                  <TableCell>{stageNameOf(inst.currentStageId)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        inst.status === "active"
                          ? "default"
                          : inst.status === "closed"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {inst.status === "active"
                        ? "نشط"
                        : inst.status === "closed"
                          ? "مغلق"
                          : "مرفوض"}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-32">
                    <Progress value={progressOf(inst)} className="h-1.5" />
                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {progressOf(inst)}%
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link to="/workflows/instances/$id" params={{ id: inst.id }}>
                      <Button size="sm" variant="outline">
                        فتح
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {requestsApi && publishedVer && (
        <CreateRequestDialog
          open={openCreate}
          onOpenChange={setOpenCreate}
          workflowVersionId={Number(publishedVer.id)}
        />
      )}
    </div>
  );
}

// ============================================================
// Live request creation dialog (API path only)
// ============================================================

const CURRENCIES = ["USD", "EUR", "SAR", "YER"] as const;

function CreateRequestDialog({
  open,
  onOpenChange,
  workflowVersionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workflowVersionId: number;
}) {
  const nav = useNavigate();
  const mutations = useRequestMutations();

  const banksQ = useBanksQuery(open);
  const merchantsQ = useMerchantsQuery(open);

  const [bankId, setBankId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const filteredMerchants = useMemo(
    () => (merchantsQ.data ?? []).filter((m) => m.entityId === bankId),
    [merchantsQ.data, bankId],
  );

  const resetForm = () => {
    setBankId("");
    setMerchantId("");
    setAmount("");
    setCurrency("USD");
    setInvoiceNumber("");
  };

  const handleSubmit = async () => {
    if (!bankId || !merchantId) {
      toast.error("اختر البنك والتاجر");
      return;
    }
    try {
      const result = await mutations.create.mutateAsync({
        workflowVersionId,
        bankId: Number(bankId),
        merchantId: Number(merchantId),
        amount: amount ? Number(amount) : undefined,
        currency: currency || undefined,
        invoiceNumber: invoiceNumber || undefined,
      });
      toast.success("تم إنشاء الطلب");
      onOpenChange(false);
      resetForm();
      const newId = (result as { id?: number }).id;
      if (newId != null) {
        nav({ to: "/workflows/instances/$id", params: { id: String(newId) } });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذّر إنشاء الطلب");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء طلب جديد</DialogTitle>
          <DialogDescription>أدخل بيانات الطلب ثم اضغط إنشاء.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Bank */}
          <div className="grid gap-1.5">
            <Label>البنك</Label>
            <Select
              value={bankId}
              onValueChange={(v) => {
                setBankId(v);
                setMerchantId(""); // reset merchant when bank changes
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر البنك" />
              </SelectTrigger>
              <SelectContent>
                {(banksQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Merchant */}
          <div className="grid gap-1.5">
            <Label>التاجر</Label>
            <Select value={merchantId} onValueChange={setMerchantId} disabled={!bankId}>
              <SelectTrigger>
                <SelectValue placeholder={bankId ? "اختر التاجر" : "اختر البنك أولًا"} />
              </SelectTrigger>
              <SelectContent>
                {filteredMerchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="grid gap-1.5">
            <Label>المبلغ</Label>
            <Input
              type="number"
              min={0}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Currency */}
          <div className="grid gap-1.5">
            <Label>العملة</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice number */}
          <div className="grid gap-1.5">
            <Label>رقم الفاتورة</Label>
            <Input
              placeholder="INV-001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={mutations.create.isPending}>
            {mutations.create.isPending ? "جارٍ الإنشاء..." : "إنشاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
