import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Building2, Edit, Eye, Search, Power, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/mock";
import { useBanks, useBankMutations, type BankEntity } from "@/lib/data/banks";
import { isDomainError } from "@/lib/data/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/entities")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <EntitiesAdmin />
    </RoleGuard>
  ),
});

type EntityPayload = {
  name: string;
  licenseNumber?: string;
  swiftCode?: string;
  status: "active" | "inactive";
};

function EntitiesAdmin() {
  const { user } = useAuth();
  const { data: list, isLoading } = useBanks();
  const mutations = useBankMutations(
    user ? { userId: String(user.id), userName: user.name, role: user.roleId } : undefined,
  );
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<BankEntity | null>(null);
  const [viewing, setViewing] = useState<BankEntity | null>(null);
  const [q, setQ] = useState("");

  const banks = useMemo(() => list ?? [], [list]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return banks;
    return banks.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        (e.licenseNumber ?? "").toLowerCase().includes(s) ||
        (e.swiftCode ?? "").toLowerCase().includes(s),
    );
  }, [banks, q]);

  async function add(p: EntityPayload) {
    try {
      await mutations.createBank.mutate({
        name: p.name,
        license_number: p.licenseNumber,
        swift_code: p.swiftCode,
      });
      toast.success(`تم إضافة "${p.name}"`);
      setOpenAdd(false);
    } catch (err) {
      toast.error(isDomainError(err) ? err.message : "فشل إضافة البنك");
    }
  }

  async function update(id: number, p: EntityPayload) {
    try {
      const bank = banks.find((b) => b.id === id);
      await mutations.updateBank.mutate({
        id,
        name: p.name,
        license_number: p.licenseNumber,
        swift_code: p.swiftCode,
        version: bank?._version,
      });
      toast.success("تم حفظ التعديلات");
      setEditing(null);
    } catch (err) {
      toast.error(isDomainError(err) ? err.message : "فشل تعديل البنك");
    }
  }

  async function toggleStatus(e: BankEntity) {
    const activate = e.status !== "active";
    try {
      await mutations.toggleBank.mutate({ id: e.id, activate });
      toast.success(activate ? `تم تفعيل ${e.name}` : `تم إيقاف ${e.name}`);
    } catch (err) {
      toast.error(isDomainError(err) ? err.message : "فشل تغيير حالة البنك");
    }
  }

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
        title="إدارة البنوك التجارية"
        subtitle="إنشاء بنوك جديدة، عرض البيانات، تعديلها وتغيير حالة التفعيل"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة البنوك" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> بنك جديد
              </Button>
            </DialogTrigger>
            <EntityDialog title="إضافة بنك جديد" onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-10"
            aria-label="بحث في البنوك"
            placeholder="بحث بالاسم أو رقم الترخيص أو SWIFT..."
          />
        </div>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="text-right">
                <th scope="col" className="px-4 py-3">
                  الجهة
                </th>
                <th scope="col" className="px-4 py-3">
                  رقم الترخيص
                </th>
                <th scope="col" className="px-4 py-3">
                  SWIFT
                </th>
                <th scope="col" className="px-4 py-3">
                  الحالة
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.licenseNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.swiftCode ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        e.status === "active"
                          ? "bg-success/15 text-success border-0"
                          : "bg-destructive/15 text-destructive border-0"
                      }
                    >
                      {e.status === "active" ? "نشط" : "غير نشط"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>
                        <Eye className="h-3.5 w-3.5 ml-1" />
                        عرض
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                        <Edit className="h-3.5 w-3.5 ml-1" />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={e.status === "active" ? "text-destructive" : "text-success"}
                        onClick={() => toggleStatus(e)}
                      >
                        <Power className="h-3.5 w-3.5 ml-1" />
                        {e.status === "active" ? "إيقاف" : "تفعيل"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    {banks.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          لا توجد بنوك بعد. أضف أول بنك تجاري ليتمكن مستخدموه من الدخول وتقديم
                          الطلبات.
                        </p>
                        <Button size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus className="h-4 w-4 ml-1" /> بنك جديد
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        لا توجد بنوك مطابقة لبحثك.
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <EntityDialog
            title="تعديل بيانات البنك"
            initial={editing}
            onSave={(p) => update(editing.id, p)}
          />
        )}
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing && (
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> {viewing.name}
              </DialogTitle>
              <DialogDescription>تفاصيل البنك</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <Row label="رقم الترخيص" value={viewing.licenseNumber ?? "—"} />
              <Row label="SWIFT" value={viewing.swiftCode ?? "—"} />
              <Row
                label="الحالة"
                value={
                  viewing.status === "active" ? "نشط" : "غير نشط"
                }
              />
              <Row label="المعرّف" value={String(viewing.id)} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium font-mono">{value}</span>
    </div>
  );
}

function EntityDialog({
  title,
  initial,
  onSave,
}: {
  title: string;
  initial?: BankEntity;
  onSave: (p: EntityPayload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber ?? "");
  const [swiftCode, setSwiftCode] = useState(initial?.swiftCode ?? "");
  const [status, setStatus] = useState<BankEntity["status"]>(initial?.status ?? "active");
  const valid = !!name.trim();
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم البنك *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>رقم الترخيص</Label>
          <Input
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="BNK-004"
          />
        </div>
        <div className="space-y-1.5">
          <Label>كود SWIFT</Label>
          <Input
            value={swiftCode}
            onChange={(e) => setSwiftCode(e.target.value)}
            placeholder="YBRDYESA"
          />
        </div>
        <div className="space-y-1.5">
          <Label>الحالة</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={status === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus("active")}
            >
              نشط
            </Button>
            <Button
              type="button"
              variant={status === "inactive" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus("inactive")}
            >
              غير نشط
            </Button>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            valid &&
            onSave({
              name: name.trim(),
              licenseNumber: licenseNumber.trim() || undefined,
              swiftCode: swiftCode.trim() || undefined,
              status,
            })
          }
          disabled={!valid}
        >
          {initial ? "حفظ التعديلات" : "إضافة"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
