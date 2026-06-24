import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Edit, Trash2, Building2, Eye, Loader2, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, ENTITIES, type Entity, type Merchant } from "@/lib/mock";
import { merchantsCell, logAudit, referenceLabels, referenceTablesCell } from "@/lib/governance";
import { canScreen } from "@/lib/workflow-bridge";
import { toast } from "sonner";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import {
  useMerchantsQuery,
  useMerchantMutations,
  useSectorValues,
  fetchMerchantDetail,
} from "@/lib/api/merchants";
import { useBanksQuery } from "@/lib/api/banks";

export const Route = createFileRoute("/merchants")({
  component: () => (
    <ScreenGuard screen="merchants">
      <Merchants />
    </ScreenGuard>
  ),
});

function linkedCompanies(m: Merchant) {
  return m.linkedCompanies?.length
    ? m.linkedCompanies
    : [
        {
          id: `${m.id}_main`,
          name: m.name,
          category: m.category,
          cr: m.cr,
          crExpiry: m.commercialRegistrationExpiry ?? "—",
        },
      ];
}

function primaryCompany(m: Merchant) {
  return linkedCompanies(m)[0];
}

function merchErr(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface MerchantsController {
  apiEnabled: boolean;
  merchants: Merchant[];
  banks: Entity[];
  sectorOptions: string[];
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  bankName: (id?: string) => string;
  getDetail: (id: string) => Promise<Merchant | null>;
  create: (m: Merchant) => Promise<void>;
  update: (id: string, m: Merchant) => Promise<void>;
  toggle: (m: Merchant) => Promise<void>;
  remove: (m: Merchant) => Promise<void>;
}

// Merchants reference banks (scope/name/picker) and sector reference values
// (category); both are sourced from the live backend when merchants is enabled.
function useMerchantsController(): MerchantsController {
  const merchantsApi = isApiEnabled("merchants");
  const banksApi = isApiEnabled("banks");
  const refApi = isApiEnabled("reference-data");
  const cellMerchants = merchantsCell.use();
  referenceTablesCell.use(); // mock sector reactivity
  const sectorsQuery = useSectorValues(merchantsApi || refApi);
  const banksQuery = useBanksQuery(merchantsApi || banksApi);
  const merchantsQuery = useMerchantsQuery(merchantsApi);
  const m = useMerchantMutations();

  const sectors = sectorsQuery.data ?? [];
  const banks = merchantsApi || banksApi ? (banksQuery.data ?? []) : ENTITIES;
  const bankName = (id?: string) => banks.find((b) => b.id === id)?.name ?? "—";

  if (merchantsApi) {
    return {
      apiEnabled: true,
      merchants: merchantsQuery.data ?? [],
      banks,
      sectorOptions: sectors.map((s) => s.label),
      isLoading: merchantsQuery.isLoading,
      error: merchantsQuery.error,
      busy: m.create.isPending || m.update.isPending || m.setStatus.isPending,
      refetch: () => void merchantsQuery.refetch(),
      bankName,
      getDetail: (id) => fetchMerchantDetail(id, sectors),
      create: async (mer) => void (await m.create.mutateAsync({ merchant: mer, sectors })),
      update: async (id, mer) => void (await m.update.mutateAsync({ id, merchant: mer, sectors })),
      // Status change is blocked server-side (CR-03) — surfaces an error until fixed.
      toggle: async (mer) =>
        void (await m.setStatus.mutateAsync({ id: mer.id, suspend: mer.status === "active" })),
      remove: async (mer) => void (await m.setStatus.mutateAsync({ id: mer.id, suspend: true })),
    };
  }

  return {
    apiEnabled: false,
    merchants: cellMerchants,
    banks: ENTITIES,
    sectorOptions: referenceLabels("sector_activity"),
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    bankName,
    getDetail: async (id) => cellMerchants.find((x) => x.id === id) ?? null,
    create: async (mer) => {
      merchantsCell.set((prev) => [mer, ...prev]);
    },
    update: async (id, mer) => {
      merchantsCell.set((prev) =>
        prev.map((x) => (x.id === id ? { ...mer, id, transactions: x.transactions } : x)),
      );
    },
    toggle: async (mer) => {
      merchantsCell.set((prev) =>
        prev.map((x) =>
          x.id === mer.id ? { ...x, status: x.status === "active" ? "suspended" : "active" } : x,
        ),
      );
    },
    remove: async (mer) => {
      merchantsCell.set((prev) => prev.filter((x) => x.id !== mer.id));
    },
  };
}

function Merchants() {
  const { user } = useAuth();
  const ctrl = useMerchantsController();
  const merchants = ctrl.merchants;
  const banks = ctrl.banks;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [viewing, setViewing] = useState<Merchant | null>(null);

  const isPlatform = user?.roleId === "rc_platform_admin";
  const isBankAdmin = user?.roleId === "rc_bank_admin";
  const canManage = !isPlatform && canScreen(user, "merchants", "add");

  function audit(action: string, ref: string, notes?: string) {
    if (!ctrl.apiEnabled && user)
      logAudit({ userId: user.id, userName: user.name, role: user.roleId, action, ref, notes });
  }

  async function openDetail(m: Merchant, mode: "edit" | "view") {
    try {
      const full = ctrl.apiEnabled ? ((await ctrl.getDetail(m.id)) ?? m) : m;
      if (mode === "edit") setEditing(full);
      else setViewing(full);
    } catch (error) {
      toast.error(merchErr(error, "تعذّر تحميل تفاصيل التاجر"));
    }
  }

  const scoped = useMemo(
    () =>
      isBankAdmin && user?.entityId
        ? merchants.filter((m) => m.entityId === user.entityId)
        : merchants,
    [merchants, isBankAdmin, user?.entityId],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (isPlatform && bankFilter !== "all" && m.entityId !== bankFilter) return false;
      if (!s) return true;
      return (
        m.name.toLowerCase().includes(s) ||
        m.tax.toLowerCase().includes(s) ||
        linkedCompanies(m).some((c) =>
          [c.name, c.cr, c.category].join(" ").toLowerCase().includes(s),
        ) ||
        ctrl.bankName(m.entityId).toLowerCase().includes(s)
      );
    });
  }, [scoped, q, statusFilter, bankFilter, isPlatform, ctrl]);

  const stats = useMemo(
    () => ({
      total: scoped.length,
      active: scoped.filter((m) => m.status === "active").length,
      suspended: scoped.filter((m) => m.status === "suspended").length,
    }),
    [scoped],
  );

  const txDisplay = (m: Merchant) => (ctrl.apiEnabled ? "—" : m.transactions);

  return (
    <div>
      <PageHeader
        title="إدارة التجار"
        subtitle={
          isPlatform
            ? "عرض جميع التجار المسجّلين على المنصّة مع البنوك التابعة لها"
            : "تسجيل ومتابعة التجار والمستوردين المرتبطين بالبنك"
        }
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "التجار" }]}
        actions={
          canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-1" /> تاجر جديد
                </Button>
              </DialogTrigger>
              <MerchantDialog
                title="تسجيل تاجر جديد"
                banks={banks}
                categoryOptions={ctrl.sectorOptions}
                defaultEntityId={user?.entityId ?? undefined}
                onSave={async (m) => {
                  try {
                    await ctrl.create(m);
                    audit("إضافة تاجر جديد", m.cr, m.name);
                    toast.success(`تم تسجيل التاجر "${m.name}"`);
                    setOpen(false);
                  } catch (error) {
                    toast.error(merchErr(error, "تعذّر تسجيل التاجر"));
                  }
                }}
              />
            </Dialog>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="إجمالي" value={stats.total} tone="bg-primary/10 text-primary" />
        <StatCard label="نشط" value={stats.active} tone="bg-success/10 text-success" />
        <StatCard label="موقوف" value={stats.suspended} tone="bg-destructive/10 text-destructive" />
      </div>

      <Card className="p-4 mb-4 shadow-card border-0 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-10"
            aria-label="بحث في التجار"
            placeholder={
              isPlatform
                ? "بحث بالاسم، السجل، الضريبي، أو البنك..."
                : "بحث برقم السجل، الرقم الضريبي، أو الاسم..."
            }
          />
        </div>
        {isPlatform && (
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="h-11 w-full sm:w-56" aria-label="تصفية حسب البنك">
              <SelectValue placeholder="البنك" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البنوك</SelectItem>
              {banks.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "active" | "suspended")}
        >
          <SelectTrigger className="h-11 w-full sm:w-44" aria-label="تصفية حسب الحالة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط فقط</SelectItem>
            <SelectItem value="suspended">موقوف فقط</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {ctrl.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </div>
      )}

      {!!ctrl.error && (
        <Card className="mb-4 flex flex-col items-center gap-2 border-0 p-6 text-center shadow-card">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {merchErr(ctrl.error, "تعذّر تحميل التجار")}
          </p>
          <Button variant="outline" size="sm" onClick={ctrl.refetch}>
            إعادة المحاولة
          </Button>
        </Card>
      )}

      {!ctrl.isLoading && !ctrl.error && isPlatform && (
        <Card className="shadow-card border-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="text-right">
                  <th scope="col" className="p-3 font-semibold">
                    التاجر
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    الرقم الضريبي
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    الشركات المرتبطة
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    القطاع
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    البنك التابع له
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    الحالة
                  </th>
                  <th scope="col" className="p-3 font-semibold tabular-nums">
                    المعاملات
                  </th>
                  <th scope="col" className="p-3 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3 text-muted-foreground tabular-nums">{m.tax}</td>
                    <td className="p-3 text-muted-foreground">{linkedCompanies(m).length}</td>
                    <td className="p-3 text-muted-foreground">
                      {primaryCompany(m).category || "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="font-normal">
                        <Building2 className="h-3 w-3 ml-1" />
                        {ctrl.bankName(m.entityId)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        className={
                          m.status === "active"
                            ? "border-0 bg-success/15 text-success"
                            : "border-0 bg-destructive/15 text-destructive"
                        }
                      >
                        {m.status === "active" ? "نشط" : "موقوف"}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums font-semibold">{txDisplay(m)}</td>
                    <td className="p-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openDetail(m, "view")}
                        aria-label="عرض التفاصيل"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      لا توجد نتائج مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!ctrl.isLoading && !ctrl.error && !isPlatform && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="p-5 shadow-card border-0 hover:shadow-soft transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                  <Building2 className="h-6 w-6" />
                </div>
                <Badge
                  className={
                    m.status === "active"
                      ? "border-0 bg-success/15 text-success"
                      : "border-0 bg-destructive/15 text-destructive"
                  }
                >
                  {m.status === "active" ? "نشط" : "موقوف"}
                </Badge>
              </div>
              <div className="font-semibold text-base">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {primaryCompany(m).category || "—"}
              </div>
              <div className="mt-4 space-y-1.5 text-xs">
                <Row k="الرقم الضريبي" v={m.tax} />
                <Row k="انتهاء البطاقة الضريبية" v={m.taxCardExpiry ?? "—"} />
                <Row k="أول سجل تجاري" v={primaryCompany(m).cr} />
                <Row k="البنك" v={ctrl.bankName(m.entityId)} />
                <Row k="العنوان" v={m.address} />
                <Row k="هاتف" v={m.contact} />
              </div>
              <div className="mt-auto pt-4 border-t flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-muted-foreground">المعاملات: </span>
                  <span className="font-bold tabular-nums">{txDisplay(m)}</span>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ctrl.busy}
                      onClick={async () => {
                        try {
                          await ctrl.toggle(m);
                        } catch (error) {
                          toast.error(merchErr(error, "تعذّر تغيير الحالة"));
                        }
                      }}
                    >
                      {m.status === "active" ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openDetail(m, "edit")}
                      aria-label="تعديل التاجر"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="حذف التاجر"
                      disabled={ctrl.busy}
                      onClick={async () => {
                        if (!confirm(`حذف التاجر "${m.name}"؟`)) return;
                        try {
                          await ctrl.remove(m);
                          audit("حذف تاجر", m.cr, m.name);
                          toast.success("تم حذف التاجر");
                        } catch (error) {
                          toast.error(merchErr(error, "تعذّر حذف التاجر"));
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card className="p-8 col-span-full text-center text-sm text-muted-foreground border-0 shadow-card">
              لا توجد نتائج مطابقة.
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <MerchantDialog
            title="تعديل بيانات التاجر"
            initial={editing}
            banks={banks}
            categoryOptions={ctrl.sectorOptions}
            defaultEntityId={user?.entityId ?? undefined}
            onSave={async (m) => {
              try {
                await ctrl.update(editing.id, m);
                audit("تعديل بيانات تاجر", m.cr, m.name);
                toast.success("تم تحديث بيانات التاجر");
                setEditing(null);
              } catch (error) {
                toast.error(merchErr(error, "تعذّر تحديث بيانات التاجر"));
              }
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing && (
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> {viewing.name}
              </DialogTitle>
              <DialogDescription>تفاصيل التاجر، عرض فقط</DialogDescription>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3 py-2 text-sm">
              <DetailRow k="الرقم الضريبي" v={viewing.tax} />
              <DetailRow k="انتهاء البطاقة الضريبية" v={viewing.taxCardExpiry ?? "—"} />
              <DetailRow k="الحالة" v={viewing.status === "active" ? "نشط" : "موقوف"} />
              <DetailRow k="البنك التابع له" v={ctrl.bankName(viewing.entityId)} />
              <DetailRow k="عدد المعاملات" v={String(txDisplay(viewing))} />
              <div className="sm:col-span-2">
                <DetailRow k="العنوان" v={viewing.address} />
              </div>
              <div className="sm:col-span-2">
                <DetailRow k="هاتف التواصل" v={viewing.contact} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">الشركات المرتبطة</div>
                {linkedCompanies(viewing).map((c) => (
                  <div key={c.id} className="rounded-lg border p-2 text-xs">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground">
                      السجل: {c.cr} · الانتهاء: {c.crExpiry} · {c.category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="p-4 shadow-card border-0">
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${tone}`}>
        <Building2 className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-end truncate">{v}</span>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function MerchantDialog({
  title,
  initial,
  banks,
  categoryOptions,
  defaultEntityId,
  onSave,
}: {
  title: string;
  initial?: Merchant;
  banks: Entity[];
  categoryOptions: string[];
  defaultEntityId?: string;
  onSave: (m: Merchant) => void;
}) {
  const defaultCompanyCategory =
    initial?.linkedCompanies?.[0]?.category ?? initial?.category ?? categoryOptions[0] ?? "";
  const [name, setName] = useState(initial?.name ?? "");
  const [tax, setTax] = useState(initial?.tax ?? "");
  const [taxCardExpiry, setTaxCardExpiry] = useState(initial?.taxCardExpiry ?? "2026-06-16");
  const [address, setAddress] = useState(initial?.address === "—" ? "" : (initial?.address ?? ""));
  const [contact, setContact] = useState(initial?.contact === "—" ? "" : (initial?.contact ?? ""));
  const [status, setStatus] = useState<"active" | "suspended">(initial?.status ?? "active");
  const [entityId, setEntityId] = useState<string>(
    initial?.entityId ?? defaultEntityId ?? banks[0]?.id ?? "",
  );
  const [owners, setOwners] = useState(
    initial?.owners?.length ? initial.owners : [{ id: `own_${Date.now()}`, name: "", share: 25 }],
  );
  const [companies, setCompanies] = useState(
    initial?.linkedCompanies?.length
      ? initial.linkedCompanies
      : [
          {
            id: `co_${Date.now()}`,
            name: "",
            category: defaultCompanyCategory,
            cr: initial?.cr ?? "",
            crExpiry: initial?.commercialRegistrationExpiry ?? "2026-06-16",
          },
        ],
  );

  const valid =
    name.trim() &&
    tax.trim() &&
    taxCardExpiry &&
    entityId &&
    companies.some((c) => c.name.trim() && c.cr.trim() && c.crExpiry);

  function submit() {
    if (!valid) return;
    const cleanCompanies = companies
      .filter((c) => c.name.trim() && c.cr.trim())
      .map((c) => ({ ...c, name: c.name.trim(), cr: c.cr.trim(), crExpiry: c.crExpiry || "—" }));
    const firstCompany = cleanCompanies[0];
    onSave({
      id: initial?.id ?? `m_${Date.now()}`,
      name: name.trim(),
      cr: firstCompany?.cr ?? "",
      tax: tax.trim(),
      address: address.trim() || "—",
      contact: contact.trim() || "—",
      category: firstCompany?.category ?? "",
      status,
      entityId,
      taxCardExpiry,
      commercialRegistrationExpiry: firstCompany?.crExpiry,
      owners: owners
        .filter((o) => o.name.trim())
        .map((o) => ({ ...o, name: o.name.trim(), share: Number(o.share) || 0 })),
      linkedCompanies: cleanCompanies,
      transactions: initial?.transactions ?? 0,
    });
  }

  return (
    <DialogContent dir="rtl" className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>الحقول المعلّمة بـ * إلزامية.</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3 py-2">
        <Field label="اسم التاجر *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: شركة الكميم للأدوية"
          />
        </Field>
        <Field label="الرقم الضريبي *">
          <Input value={tax} onChange={(e) => setTax(e.target.value)} placeholder="4123456" />
        </Field>
        <Field label="تاريخ انتهاء البطاقة الضريبية *">
          <Input
            type="date"
            value={taxCardExpiry}
            onChange={(e) => setTaxCardExpiry(e.target.value)}
          />
        </Field>
        <Field label="هاتف التواصل">
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+9677…"
          />
        </Field>
        <Field label="الحالة">
          <Select value={status} onValueChange={(v) => setStatus(v as "active" | "suspended")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="suspended">موقوف</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="البنك التابع له *">
            <Select
              value={entityId}
              onValueChange={setEntityId}
              disabled={!!defaultEntityId && !initial}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {banks.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="العنوان">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="المدينة، الشارع"
            />
          </Field>
        </div>
        <div className="sm:col-span-2 rounded-xl border p-3">
          <div className="mb-3 flex items-center justify-between">
            <Label className="font-semibold">الملاك والمساهمون (25% فأكثر)</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setOwners((prev) => [...prev, { id: `own_${Date.now()}`, name: "", share: 25 }])
              }
            >
              <Plus className="ms-1 h-4 w-4" /> إضافة مالك
            </Button>
          </div>
          <div className="space-y-2">
            {owners.map((owner) => (
              <div key={owner.id} className="grid grid-cols-[1fr_110px_auto] gap-2">
                <Input
                  value={owner.name}
                  onChange={(e) =>
                    setOwners((prev) =>
                      prev.map((o) => (o.id === owner.id ? { ...o, name: e.target.value } : o)),
                    )
                  }
                  placeholder="اسم المالك / المساهم"
                />
                <Input
                  type="number"
                  value={owner.share}
                  onChange={(e) =>
                    setOwners((prev) =>
                      prev.map((o) =>
                        o.id === owner.id ? { ...o, share: Number(e.target.value) } : o,
                      ),
                    )
                  }
                  placeholder="%"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="إزالة المالك"
                  onClick={() => setOwners((prev) => prev.filter((o) => o.id !== owner.id))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2 rounded-xl border p-3">
          <div className="mb-3 flex items-center justify-between">
            <Label className="font-semibold">الشركات المرتبطة</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setCompanies((prev) => [
                  ...prev,
                  {
                    id: `co_${Date.now()}`,
                    name: "",
                    category: categoryOptions[0] ?? "",
                    cr: "",
                    crExpiry: "2026-06-16",
                  },
                ])
              }
            >
              <Plus className="ms-1 h-4 w-4" /> إضافة شركة
            </Button>
          </div>
          <div className="space-y-3">
            {companies.map((company) => (
              <div
                key={company.id}
                className="grid gap-2 rounded-lg bg-muted/30 p-2 sm:grid-cols-2"
              >
                <Input
                  value={company.name}
                  onChange={(e) =>
                    setCompanies((prev) =>
                      prev.map((c) => (c.id === company.id ? { ...c, name: e.target.value } : c)),
                    )
                  }
                  placeholder="اسم الشركة"
                />
                <Select
                  value={company.category}
                  onValueChange={(v) =>
                    setCompanies((prev) =>
                      prev.map((c) => (c.id === company.id ? { ...c, category: v } : c)),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={company.cr}
                  onChange={(e) =>
                    setCompanies((prev) =>
                      prev.map((c) => (c.id === company.id ? { ...c, cr: e.target.value } : c)),
                    )
                  }
                  placeholder="رقم السجل التجاري"
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    type="date"
                    value={company.crExpiry}
                    onChange={(e) =>
                      setCompanies((prev) =>
                        prev.map((c) =>
                          c.id === company.id ? { ...c, crExpiry: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setCompanies((prev) => prev.filter((c) => c.id !== company.id))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={!valid}>
          {initial ? "حفظ التعديلات" : "حفظ التاجر"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
