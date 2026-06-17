import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Edit, Power, Search, Trash2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  roleCatalogCell, orgsCell, getOrgLabel, logAudit, type RoleCatalogEntry,
} from "@/lib/governance";
import { DEMO_USERS, ROLE_LABELS, useAuth, type Role } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/roles")({
  component: () => (
    <RoleGuard allow={["platform_admin"]}>
      <RolesAdmin />
    </RoleGuard>
  ),
});


type Payload = { name: string; orgId: string; legacyRole: Role };

function RolesAdmin() {
  const { user } = useAuth();
  const roles = roleCatalogCell.use();
  const orgs = orgsCell.use();
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<RoleCatalogEntry | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return roles
      .filter((r) => orgFilter === "all" || r.orgId === orgFilter)
      .filter((r) => !s || r.name.toLowerCase().includes(s));
  }, [roles, q, orgFilter]);

  function audit(action: string, ref: string, notes?: string) {
    if (user) logAudit({ userId: user.id, userName: user.name, role: user.role, action, ref, notes });
  }

  function add(p: Payload) {
    const id = `rc_${Date.now()}`;
    roleCatalogCell.set((prev) => [...prev, { id, ...p, active: true }]);
    audit("إضافة دور", id, p.name);
    toast.success(`تمت إضافة الدور "${p.name}"`);
    setOpenAdd(false);
  }

  function update(target: RoleCatalogEntry, p: Payload) {
    roleCatalogCell.set((prev) => prev.map((r) => r.id === target.id ? { ...r, ...p } : r));
    audit("تعديل دور", target.id, p.name);
    toast.success("تم حفظ التعديلات");
    setEditing(null);
  }

  function toggle(r: RoleCatalogEntry) {
    roleCatalogCell.set((prev) => prev.map((x) => x.id === r.id ? { ...x, active: !x.active } : x));
    audit(r.active ? "إلغاء تفعيل دور" : "تفعيل دور", r.id, r.name);
    toast.success(r.active ? `تم إلغاء تفعيل "${r.name}"` : `تم تفعيل "${r.name}"`);
  }

  function remove(r: RoleCatalogEntry) {
    if (r.builtin) return toast.error("لا يمكن حذف دور افتراضي. يمكنك إلغاء تفعيله.");
    roleCatalogCell.set((prev) => prev.filter((x) => x.id !== r.id));
    audit("حذف دور", r.id, r.name);
    toast.success(`تم حذف "${r.name}"`);
  }

  return (
    <div>
      <PageHeader
        title="إدارة الأدوار"
        subtitle="تعريف الأدوار المتاحة في النظام — كل دور يتبع جهة ويُربط بصلاحيات أساسية في محرّك سير العمل"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة الأدوار" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-1" /> دور جديد</Button>
            </DialogTrigger>
            <RoleDialog title="إضافة دور جديد" orgs={orgs.filter((o) => o.active)} onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pr-10" placeholder="بحث باسم الدور..." />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الجهات</SelectItem>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-3">اسم الدور</th>
              <th className="px-4 py-3">الجهة</th>
              <th className="px-4 py-3">الصلاحيات الأساسية</th>
              <th className="px-4 py-3">المستخدمون</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const userCount = DEMO_USERS.filter((u) => u.role === r.legacyRole).length;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><KeyRound className="h-4 w-4" /></div>
                      <div className="font-medium">{r.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{getOrgLabel(r.orgId)}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[r.legacyRole]}</Badge></td>
                  <td className="px-4 py-3 text-xs tabular-nums">{userCount}</td>
                  <td className="px-4 py-3">
                    {r.builtin
                      ? <Badge className="bg-info/15 text-info border-0">افتراضي</Badge>
                      : <Badge className="bg-muted text-muted-foreground border-0">مخصّص</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {r.active
                      ? <Badge className="bg-success/15 text-success border-0">نشط</Badge>
                      : <Badge className="bg-destructive/15 text-destructive border-0">غير نشط</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Edit className="h-3.5 w-3.5 ml-1" />تعديل</Button>
                      <Button size="sm" variant="ghost" className={r.active ? "text-destructive" : "text-success"} onClick={() => toggle(r)}>
                        <Power className="h-3.5 w-3.5 ml-1" />{r.active ? "إلغاء تفعيل" : "تفعيل"}
                      </Button>
                      {!r.builtin && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r)}>
                          <Trash2 className="h-3.5 w-3.5 ml-1" />حذف
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد أدوار.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && <RoleDialog title="تعديل الدور" initial={editing} orgs={orgs.filter((o) => o.active)} onSave={(p) => update(editing, p)} />}
      </Dialog>
    </div>
  );
}

function RoleDialog({ title, initial, orgs, onSave }: {
  title: string;
  initial?: RoleCatalogEntry;
  orgs: { id: string; label: string }[];
  onSave: (p: Payload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [orgId, setOrgId] = useState<string>(initial?.orgId ?? (orgs[0]?.id ?? "bank"));
  const valid = name.trim().length > 0 && orgId;
  const defaultLegacyFor = (oid: string): Role =>
    oid === "platform" ? "platform_admin" : oid === "committee" ? "support_member" : "bank_intake";
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>اسم الدور والجهة التي يتبعها.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم الدور *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مدقق أول" />
        </div>
        <div className="space-y-1.5">
          <Label>الجهة *</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!valid} onClick={() => valid && onSave({ name: name.trim(), orgId, legacyRole: initial?.legacyRole ?? defaultLegacyFor(orgId) })}>
          {initial ? "حفظ التعديلات" : "إضافة الدور"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
