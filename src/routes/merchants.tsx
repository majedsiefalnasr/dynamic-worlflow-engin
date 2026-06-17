import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Edit, Trash2, Building2, Eye } from "lucide-react";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth, ENTITIES, type Merchant } from "@/lib/mock";
import { merchantsCell, logAudit } from "@/lib/governance";
import { toast } from "sonner";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";

const CATEGORIES = ["مواد غذائية", "أدوية ومستلزمات طبية", "مشتقات نفطية", "قطع غيار", "مواد بناء", "إلكترونيات"];

export const Route = createFileRoute("/merchants")({
  component: () => (
    <ScreenGuard screen="merchants">
      <Merchants />
    </ScreenGuard>
  ),
});

function entityName(id?: string) {
  return ENTITIES.find((e) => e.id === id)?.name ?? "—";
}

function Merchants() {
  const { user } = useAuth();
  const merchants = merchantsCell.use();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [viewing, setViewing] = useState<Merchant | null>(null);

  const isPlatform = user?.role === "platform_admin";
  const isBankAdmin = user?.role === "bank_admin";
  const canManage = isBankAdmin; // CBY is read-only

  // Bank admins see only their own bank's merchants
  const scoped = useMemo(
    () => (isBankAdmin && user?.entityId ? merchants.filter((m) => m.entityId === user.entityId) : merchants),
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
        m.cr.toLowerCase().includes(s) ||
        m.tax.toLowerCase().includes(s) ||
        entityName(m.entityId).toLowerCase().includes(s)
      );
    });
  }, [scoped, q, statusFilter, bankFilter, isPlatform]);

  const stats = useMemo(() => ({
    total: scoped.length,
    active: scoped.filter((m) => m.status === "active").length,
    suspended: scoped.filter((m) => m.status === "suspended").length,
  }), [scoped]);

  return (
    <div>
      <PageHeader
        title="إدارة التجار"
        subtitle={isPlatform
          ? "عرض جميع التجار المسجّلين على المنصّة مع البنوك التابعة لها"
          : "تسجيل ومتابعة التجار والمستوردين المرتبطين بالبنك"}
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
                defaultEntityId={user?.entityId ?? undefined}
                onSave={(m) => {
                  merchantsCell.set((prev) => [m, ...prev]);
                  logAudit({
                    userId: user!.id, userName: user!.name, role: user!.role,
                    action: "إضافة تاجر جديد", ref: m.cr, notes: m.name,
                  });
                  toast.success(`تم تسجيل التاجر "${m.name}"`);
                  setOpen(false);
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
            placeholder={isPlatform ? "بحث بالاسم، السجل، الضريبي، أو البنك..." : "بحث برقم السجل، الرقم الضريبي، أو الاسم..."}
          />
        </div>
        {isPlatform && (
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="البنك" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البنوك</SelectItem>
              {ENTITIES.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
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
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="text-right">
                  <th className="p-3 font-semibold">التاجر</th>
                  <th className="p-3 font-semibold">السجل التجاري</th>
                  <th className="p-3 font-semibold">الرقم الضريبي</th>
                  <th className="p-3 font-semibold">القطاع</th>
                  <th className="p-3 font-semibold">البنك التابع له</th>
                  <th className="p-3 font-semibold">الحالة</th>
                  <th className="p-3 font-semibold tabular-nums">المعاملات</th>
                  <th className="p-3 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3 text-muted-foreground">{m.cr}</td>
                    <td className="p-3 text-muted-foreground tabular-nums">{m.tax}</td>
                    <td className="p-3 text-muted-foreground">{m.category}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="font-normal">
                        <Building2 className="h-3 w-3 ml-1" />
                        {entityName(m.entityId)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={m.status === "active" ? "bg-success/15 text-success border-0" : "bg-destructive/15 text-destructive border-0"}>
                        {m.status === "active" ? "نشط" : "موقوف"}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums font-semibold">{m.transactions}</td>
                    <td className="p-3">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewing(m)} aria-label="عرض التفاصيل">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد نتائج مطابقة.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <Card key={m.id} className="p-5 shadow-card border-0 hover:shadow-soft transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-hero text-white grid place-items-center">
                  <Building2 className="h-6 w-6" />
                </div>
                <Badge className={m.status === "active" ? "bg-success/15 text-success border-0" : "bg-destructive/15 text-destructive border-0"}>
                  {m.status === "active" ? "نشط" : "موقوف"}
                </Badge>
              </div>
              <div className="font-semibold text-base">{m.name}</div>
              <div className="text-xs text-muted-foreground">{m.category}</div>
              <div className="mt-4 space-y-1.5 text-xs">
                <Row k="السجل التجاري" v={m.cr} />
                <Row k="الرقم الضريبي" v={m.tax} />
                <Row k="البنك" v={entityName(m.entityId)} />
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
                      size="sm" variant="ghost" className="h-8"
                      onClick={() => merchantsCell.set((prev) => prev.map((x) => x.id === m.id ? { ...x, status: x.status === "active" ? "suspended" : "active" } : x))}
                    >
                      {m.status === "active" ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(m)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (!confirm(`حذف التاجر "${m.name}"؟`)) return;
                        merchantsCell.set((prev) => prev.filter((x) => x.id !== m.id));
                        logAudit({ userId: user!.id, userName: user!.name, role: user!.role, action: "حذف تاجر", ref: m.cr, notes: m.name });
                        toast.success("تم حذف التاجر");
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
            defaultEntityId={user?.entityId ?? undefined}
            onSave={(m) => {
              merchantsCell.set((prev) => prev.map((x) => x.id === editing.id ? { ...m, id: editing.id, transactions: editing.transactions } : x));
              logAudit({ userId: user!.id, userName: user!.name, role: user!.role, action: "تعديل بيانات تاجر", ref: m.cr, notes: m.name });
              toast.success("تم تحديث بيانات التاجر");
              setEditing(null);
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
              <DialogDescription>تفاصيل التاجر — عرض فقط</DialogDescription>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3 py-2 text-sm">
              <DetailRow k="السجل التجاري" v={viewing.cr} />
              <DetailRow k="الرقم الضريبي" v={viewing.tax} />
              <DetailRow k="القطاع" v={viewing.category} />
              <DetailRow k="الحالة" v={viewing.status === "active" ? "نشط" : "موقوف"} />
              <DetailRow k="البنك التابع له" v={entityName(viewing.entityId)} />
              <DetailRow k="عدد المعاملات" v={String(viewing.transactions)} />
              <div className="sm:col-span-2"><DetailRow k="العنوان" v={viewing.address} /></div>
              <div className="sm:col-span-2"><DetailRow k="هاتف التواصل" v={viewing.contact} /></div>
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
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
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

function MerchantDialog({ title, initial, defaultEntityId, onSave }: { title: string; initial?: Merchant; defaultEntityId?: string; onSave: (m: Merchant) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cr, setCr] = useState(initial?.cr ?? "");
  const [tax, setTax] = useState(initial?.tax ?? "");
  const [address, setAddress] = useState(initial?.address === "—" ? "" : initial?.address ?? "");
  const [contact, setContact] = useState(initial?.contact === "—" ? "" : initial?.contact ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [status, setStatus] = useState<"active" | "suspended">(initial?.status ?? "active");
  const [entityId, setEntityId] = useState<string>(initial?.entityId ?? defaultEntityId ?? ENTITIES[0].id);

  const valid = name.trim() && cr.trim() && tax.trim() && entityId;

  function submit() {
    if (!valid) return;
    onSave({
      id: initial?.id ?? `m_${Date.now()}`,
      name: name.trim(), cr: cr.trim(), tax: tax.trim(),
      address: address.trim() || "—",
      contact: contact.trim() || "—",
      category, status, entityId,
      transactions: initial?.transactions ?? 0,
    });
  }

  return (
    <DialogContent dir="rtl" className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>الحقول المعلّمة بـ * إلزامية.</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3 py-2">
        <Field label="اسم التاجر / الشركة *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة الكميم للأدوية" />
        </Field>
        <Field label="رقم السجل التجاري *">
          <Input value={cr} onChange={(e) => setCr(e.target.value)} placeholder="CR-12345" />
        </Field>
        <Field label="الرقم الضريبي *">
          <Input value={tax} onChange={(e) => setTax(e.target.value)} placeholder="4123456" />
        </Field>
        <Field label="هاتف التواصل">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+9677…" />
        </Field>
        <Field label="القطاع / النشاط">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="الحالة">
          <Select value={status} onValueChange={(v) => setStatus(v as "active" | "suspended")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="suspended">موقوف</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="البنك التابع له *">
            <Select value={entityId} onValueChange={setEntityId} disabled={!!defaultEntityId && !initial}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITIES.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="العنوان">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة – الشارع" />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={!valid}>{initial ? "حفظ التعديلات" : "حفظ التاجر"}</Button>
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
