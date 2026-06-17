import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Building2, Edit, Eye, Search, Power } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Entity, useAuth } from "@/lib/mock";
import { entitiesCell, logAudit } from "@/lib/governance";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/entities")({
  component: () => (
    <RoleGuard allow={["platform_admin"]}>
      <EntitiesAdmin />
    </RoleGuard>
  ),
});

type EntityPayload = { name: string; licenseNo: string; swiftCode?: string; status: "active" | "suspended"; adminName?: string; adminEmail?: string };

function EntitiesAdmin() {
  const { user } = useAuth();
  const list = entitiesCell.use();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [viewing, setViewing] = useState<Entity | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((e) =>
      e.name.toLowerCase().includes(s) ||
      e.licenseNo.toLowerCase().includes(s) ||
      (e.swiftCode ?? "").toLowerCase().includes(s),
    );
  }, [list, q]);

  function add(p: EntityPayload) {
    const e: Entity = { id: `e_${Date.now()}`, type: "bank", ...p };
    entitiesCell.set((prev) => [...prev, e]);
    if (user) logAudit({ userId: user.id, userName: user.name, role: user.role, action: "إضافة بنك جديد", ref: e.id, notes: e.name });
    toast.success(`تم إضافة "${p.name}"`);
    setOpenAdd(false);
  }

  function update(id: string, p: EntityPayload) {
    entitiesCell.set((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
    if (user) logAudit({ userId: user.id, userName: user.name, role: user.role, action: "تعديل بيانات بنك", ref: id, notes: p.name });
    toast.success("تم حفظ التعديلات");
    setEditing(null);
  }

  function toggleStatus(e: Entity) {
    const next: Entity["status"] = e.status === "active" ? "suspended" : "active";
    entitiesCell.set((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    if (user) logAudit({ userId: user.id, userName: user.name, role: user.role, action: next === "active" ? "تفعيل بنك" : "إيقاف بنك", ref: e.id, notes: e.name });
    toast.success(next === "active" ? `تم تفعيل ${e.name}` : `تم إيقاف ${e.name}`);
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
              <Button><Plus className="h-4 w-4 ml-1" /> بنك جديد</Button>
            </DialogTrigger>
            <EntityDialog title="إضافة بنك جديد" onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pr-10" placeholder="بحث بالاسم أو رقم الترخيص أو SWIFT..." />
        </div>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-3">الجهة</th>
              <th className="px-4 py-3">رقم الترخيص</th>
              <th className="px-4 py-3">SWIFT</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><Building2 className="h-4 w-4" /></div>
                    {e.name}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{e.licenseNo}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.swiftCode ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge className={e.status === "active" ? "bg-success/15 text-success border-0" : "bg-destructive/15 text-destructive border-0"}>
                    {e.status === "active" ? "نشط" : "موقوف"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(e)}><Eye className="h-3.5 w-3.5 ml-1" />عرض</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}><Edit className="h-3.5 w-3.5 ml-1" />تعديل</Button>
                    <Button size="sm" variant="ghost" className={e.status === "active" ? "text-destructive" : "text-success"} onClick={() => toggleStatus(e)}>
                      <Power className="h-3.5 w-3.5 ml-1" />{e.status === "active" ? "إيقاف" : "تفعيل"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد نتائج.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <EntityDialog title="تعديل بيانات البنك" initial={editing} onSave={(p) => update(editing.id, p)} />
        )}
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing && (
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> {viewing.name}</DialogTitle>
              <DialogDescription>تفاصيل البنك</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <Row label="رقم الترخيص" value={viewing.licenseNo} />
              <Row label="SWIFT" value={viewing.swiftCode ?? "—"} />
              <Row label="الحالة" value={viewing.status === "active" ? "نشط" : "موقوف"} />
              <Row label="المعرّف" value={viewing.id} />
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

function EntityDialog({ title, initial, onSave }: { title: string; initial?: Entity; onSave: (p: EntityPayload) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [licenseNo, setLicenseNo] = useState(initial?.licenseNo ?? "");
  const [swiftCode, setSwiftCode] = useState(initial?.swiftCode ?? "");
  const [status, setStatus] = useState<Entity["status"]>(initial?.status ?? "active");
  const [adminName, setAdminName] = useState(initial?.adminName ?? "");
  const [adminEmail, setAdminEmail] = useState(initial?.adminEmail ?? "");
  const isNew = !initial;
  const emailOk = !adminEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim());
  const adminOk = isNew ? (adminName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) : emailOk;
  const valid = name.trim() && licenseNo.trim() && adminOk;
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><Label>اسم البنك *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>رقم الترخيص *</Label><Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} placeholder="BNK-004" /></div>
        <div className="space-y-1.5"><Label>كود SWIFT</Label><Input value={swiftCode} onChange={(e) => setSwiftCode(e.target.value)} placeholder="YBRDYESA" /></div>
        <div className="space-y-1.5">
          <Label>الحالة</Label>
          <div className="flex gap-2">
            <Button type="button" variant={status === "active" ? "default" : "outline"} size="sm" onClick={() => setStatus("active")}>نشط</Button>
            <Button type="button" variant={status === "suspended" ? "default" : "outline"} size="sm" onClick={() => setStatus("suspended")}>موقوف</Button>
          </div>
        </div>

        <div className="pt-3 mt-2 border-t">
          <div className="text-sm font-semibold mb-1">حساب مدير البنك {isNew && <span className="text-destructive">*</span>}</div>
          <p className="text-xs text-muted-foreground mb-3">
            {isNew
              ? "يُنشأ حساب المدير الأول للبنك تلقائياً ويُستخدم لتسجيل الدخول وإضافة باقي المستخدمين."
              : "بيانات المدير الأول للبنك."}
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم المدير {isNew && "*"}</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="مثال: محمد علي" />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني للمدير {isNew && "*"}</Label>
              <Input type="email" dir="ltr" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@bank.ye" />
              {!emailOk && <p className="text-xs text-destructive">صيغة البريد غير صحيحة</p>}
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => valid && onSave({ name: name.trim(), licenseNo: licenseNo.trim(), swiftCode: swiftCode.trim() || undefined, status, adminName: adminName.trim() || undefined, adminEmail: adminEmail.trim() || undefined })} disabled={!valid}>
          {initial ? "حفظ التعديلات" : "إضافة"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
