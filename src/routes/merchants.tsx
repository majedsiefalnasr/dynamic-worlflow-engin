import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Edit, Trash2, Building2, Eye, Loader2 } from "lucide-react";
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
import { useAuth } from "@/lib/mock";
import type { Merchant } from "@/lib/data/merchants";
import { useMerchants, useMerchantDetail, useMerchantMutations } from "@/lib/data/merchants";
import { useBanks } from "@/lib/data/banks";
import { isDomainError } from "@/lib/data/errors";
import {
  referenceLabels,
  referenceValues,
  referenceTablesCell,
  screenPermsCell,
} from "@/lib/governance";
import { canScreen } from "@/lib/workflow-bridge";
import { toast } from "sonner";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";

export const Route = createFileRoute("/merchants")({
  component: () => (
    <ScreenGuard screen="merchants">
      <Merchants />
    </ScreenGuard>
  ),
});

function entityName(banks: { id: number; name: string }[], id?: string) {
  return banks.find((e) => String(e.id) === id)?.name ?? "—";
}

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

// Bank IDs and entity IDs are now both numeric (aligned by the banks adapter).
function bankIdToEntityId(bankId?: number | null): string | undefined {
  return bankId != null ? String(bankId) : undefined;
}

function sectorIdByLabel(label: string): number | undefined {
  const v = referenceValues("sector_activity").find((r) => r.label === label);
  return v ? Number(v.id) : undefined;
}

function toMerchantPayload(m: Merchant) {
  return {
    name: m.name,
    bank_id: m.entityId ? Number(m.entityId) : undefined,
    tax_number: m.tax || undefined,
    tax_card_expiry: m.taxCardExpiry || undefined,
    phone: m.contact === "—" ? undefined : m.contact || undefined,
    address: m.address === "—" ? undefined : m.address || undefined,
    status: m.status === "suspended" ? "SUSPENDED" : "ACTIVE",
    owners: m.owners
      ?.filter((o) => o.name.trim())
      .map((o) => ({ name: o.name, ownership_percentage: o.share })),
    companies: m.linkedCompanies
      ?.filter((c) => c.name.trim() && c.cr.trim())
      .map((c) => ({
        name: c.name,
        commercial_registration_number: c.cr,
        commercial_registration_expiry: c.crExpiry === "—" ? undefined : c.crExpiry,
        sector_reference_value_id: c.category ? sectorIdByLabel(c.category) : undefined,
      })),
  };
}

function Merchants() {
  const { user } = useAuth();
  const { data: merchantList, isLoading } = useMerchants();
  const { data: bankList } = useBanks();
  // Bank list may 403 when the user's role lacks banks:VIEW. Fall back to the
  // user's own bank from the auth payload — enough for the locked dropdown and
  // display when the full list is unavailable.
  const banks = useMemo(() => {
    if (bankList?.length) return bankList;
    if (user?.bank)
      return [
        { id: user.bank.id, name: user.bank.name, code: user.bank.code, status: "active" as const },
      ];
    return [];
  }, [bankList, user?.bank]);
  const mutations = useMerchantMutations(
    user ? { userId: String(user.id), userName: user.name, role: user.roleId } : undefined,
  );
  const merchants = useMemo(() => merchantList ?? [], [merchantList]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { data: editingDetail, isLoading: editingLoading } = useMerchantDetail(editingId);
  const [viewing, setViewing] = useState<Merchant | null>(null);

  screenPermsCell.use();
  const isPlatform = user?.roleId === "rc_platform_admin";
  const isBankAdmin = user?.roleId === "rc_bank_admin";
  const canManage = !isPlatform && canScreen(user, "merchants", "add");

  const userEntityId = bankIdToEntityId(user?.bankId);

  // Bank admins see only their own bank's merchants
  const scoped = useMemo(
    () =>
      isBankAdmin && userEntityId
        ? merchants.filter((m) => m.entityId === userEntityId)
        : merchants,
    [merchants, isBankAdmin, userEntityId],
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
        entityName(banks, m.entityId).toLowerCase().includes(s)
      );
    });
  }, [scoped, q, statusFilter, bankFilter, isPlatform, banks]);

  const stats = useMemo(
    () => ({
      total: scoped.length,
      active: scoped.filter((m) => m.status === "active").length,
      suspended: scoped.filter((m) => m.status === "suspended").length,
    }),
    [scoped],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                defaultEntityId={userEntityId}
                lockEntity={!isPlatform}
                banks={banks}
                onSave={async (m) => {
                  try {
                    await mutations.createMerchant.mutate(toMerchantPayload(m));
                    toast.success(`تم تسجيل التاجر "${m.name}"`);
                    setOpen(false);
                  } catch (err) {
                    toast.error(isDomainError(err) ? err.message : "فشل إضافة التاجر");
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
                <SelectItem key={e.id} value={String(e.id)}>
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

      {isPlatform ? (
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
                        {entityName(banks, m.entityId)}
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
                    <td className="p-3 tabular-nums font-semibold">{m.transactions}</td>
                    <td className="p-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewing(m)}
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
      ) : (
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
                <Row k="البنك" v={entityName(banks, m.entityId)} />
                <Row k="العنوان" v={m.address} />
                <Row k="هاتف" v={m.contact} />
              </div>
              <div className="mt-auto pt-4 border-t flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-muted-foreground">المعاملات: </span>
                  <span className="font-bold tabular-nums">{m.transactions}</span>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const activate = m.status !== "active";
                        try {
                          await mutations.toggleMerchant.mutate({ id: Number(m.id), activate });
                          toast.success(activate ? `تم تفعيل ${m.name}` : `تم إيقاف ${m.name}`);
                        } catch (err) {
                          toast.error(isDomainError(err) ? err.message : "فشل تغيير حالة التاجر");
                        }
                      }}
                    >
                      {m.status === "active" ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingId(Number(m.id))}
                      aria-label="تعديل التاجر"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="حذف التاجر"
                      onClick={async () => {
                        if (!confirm(`حذف التاجر "${m.name}"؟`)) return;
                        try {
                          await mutations.deleteMerchant.mutate({ id: Number(m.id) });
                          toast.success("تم حذف التاجر");
                        } catch (err) {
                          toast.error(isDomainError(err) ? err.message : "فشل حذف التاجر");
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

      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        {editingId && editingLoading && (
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </DialogContent>
        )}
        {editingDetail && (
          <MerchantDialog
            title="تعديل بيانات التاجر"
            initial={editingDetail}
            defaultEntityId={userEntityId}
            lockEntity={!isPlatform}
            banks={banks}
            onSave={async (m) => {
              try {
                await mutations.updateMerchant.mutate({
                  id: Number(editingDetail.id),
                  ...toMerchantPayload(m),
                  version: editingDetail._version,
                });
                toast.success("تم تحديث بيانات التاجر");
                setEditingId(null);
              } catch (err) {
                toast.error(isDomainError(err) ? err.message : "فشل تعديل التاجر");
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
              <DetailRow k="البنك التابع له" v={entityName(banks, viewing.entityId)} />
              <DetailRow k="عدد المعاملات" v={String(viewing.transactions)} />
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
  defaultEntityId,
  lockEntity,
  banks,
  onSave,
}: {
  title: string;
  initial?: Merchant;
  defaultEntityId?: string;
  lockEntity?: boolean;
  banks: { id: number; name: string }[];
  onSave: (m: Merchant) => void;
}) {
  referenceTablesCell.use();
  const categoryOptions = referenceLabels("sector_activity");
  const defaultCompanyCategory =
    initial?.linkedCompanies?.[0]?.category ?? initial?.category ?? categoryOptions[0] ?? "";
  const [name, setName] = useState(initial?.name ?? "");
  const [tax, setTax] = useState(initial?.tax ?? "");
  const [taxCardExpiry, setTaxCardExpiry] = useState(initial?.taxCardExpiry ?? "2026-06-16");
  const [address, setAddress] = useState(initial?.address === "—" ? "" : (initial?.address ?? ""));
  const [contact, setContact] = useState(initial?.contact === "—" ? "" : (initial?.contact ?? ""));
  const [status, setStatus] = useState<"active" | "suspended">(initial?.status ?? "active");
  const [entityId, setEntityId] = useState<string>(
    initial?.entityId ?? defaultEntityId ?? (banks[0] ? String(banks[0].id) : ""),
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
            <Select value={entityId} onValueChange={setEntityId} disabled={lockEntity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {banks.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
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
