import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Edit, Power, Search, Trash2, Building2, Network, Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  orgsCell, teamsCell, roleCatalogCell, logAudit, type OrgRecord,
} from "@/lib/governance";
import { DEMO_USERS, useAuth } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/orgs")({
  component: () => (
    <RoleGuard allow={["platform_admin"]}>
      <OrgsAdmin />
    </RoleGuard>
  ),
});

type Payload = { label: string; isBank: boolean };

function OrgsAdmin() {
  const { user } = useAuth();
  const orgs = orgsCell.use();
  const teams = teamsCell.use();
  const roles = roleCatalogCell.use();
  const [q, setQ] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<OrgRecord | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orgs.filter((o) => !s || o.label.toLowerCase().includes(s) || o.id.toLowerCase().includes(s));
  }, [orgs, q]);

  function audit(action: string, ref: string, notes?: string) {
    if (user) logAudit({ userId: user.id, userName: user.name, role: user.role, action, ref, notes });
  }

  function slug(s: string) {
    const base = s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    return base || `org_${Date.now()}`;
  }

  function add(p: Payload) {
    let id = slug(p.label);
    if (orgs.some((o) => o.id === id)) id = `${id}_${Date.now().toString(36)}`;
    orgsCell.set((prev) => [...prev, { id, label: p.label, active: true, isBank: p.isBank }]);
    audit("إضافة جهة", id, p.label);
    toast.success(`تمت إضافة الجهة "${p.label}"`);
    setOpenAdd(false);
  }

  function update(target: OrgRecord, p: Payload) {
    orgsCell.set((prev) => prev.map((o) => o.id === target.id ? { ...o, label: p.label, isBank: p.isBank } : o));
    audit("تعديل جهة", target.id, p.label);
    toast.success("تم حفظ التعديلات");
    setEditing(null);
  }

  function toggle(o: OrgRecord) {
    orgsCell.set((prev) => prev.map((x) => x.id === o.id ? { ...x, active: !x.active } : x));
    audit(o.active ? "إلغاء تفعيل جهة" : "تفعيل جهة", o.id, o.label);
    toast.success(o.active ? `تم إلغاء تفعيل "${o.label}"` : `تم تفعيل "${o.label}"`);
  }

  function remove(o: OrgRecord) {
    if (o.builtin) return toast.error("لا يمكن حذف جهة افتراضية.");
    const usedByTeams = teams.filter((t) => t.orgKind === o.id).length;
    const usedByRoles = roles.filter((r) => r.orgId === o.id).length;
    if (usedByTeams || usedByRoles) {
      return toast.error(`لا يمكن الحذف — مرتبطة بـ ${usedByTeams} فريق و ${usedByRoles} دور.`);
    }
    orgsCell.set((prev) => prev.filter((x) => x.id !== o.id));
    audit("حذف جهة", o.id, o.label);
    toast.success(`تم حذف "${o.label}"`);
  }

  return (
    <div>
      <PageHeader
        title="إدارة الجهات"
        subtitle="تعريف الجهات المستفيدة من النظام (بنوك، لجان، إدارات) — تُستخدم في تصنيف الفرق والأدوار والمستخدمين"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة الجهات" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-1" /> جهة جديدة</Button>
            </DialogTrigger>
            <OrgDialog title="إضافة جهة جديدة" onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pr-10" placeholder="بحث باسم أو معرّف الجهة..." />
        </div>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-3">الجهة</th>
              <th className="px-4 py-3">الفرق</th>
              <th className="px-4 py-3">الأدوار</th>
              <th className="px-4 py-3">المستخدمون</th>
              <th className="px-4 py-3">التصنيف</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const teamCount = teams.filter((t) => t.orgKind === o.id).length;
              const roleCount = roles.filter((r) => r.orgId === o.id).length;
              const userCount = DEMO_USERS.filter((u) => u.orgKind === o.id).length;
              return (
                <tr key={o.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><Network className="h-4 w-4" /></div>
                      <div>
                        <div className="font-medium">{o.label}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{o.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">{teamCount}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{roleCount}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{userCount}</td>
                  <td className="px-4 py-3">
                    {o.isBank
                      ? <Badge className="bg-info/15 text-info border-0 gap-1"><Landmark className="h-3 w-3" /> بنوك</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {o.builtin
                      ? <Badge className="bg-info/15 text-info border-0">افتراضي</Badge>
                      : <Badge className="bg-muted text-muted-foreground border-0">مخصّص</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {o.active
                      ? <Badge className="bg-success/15 text-success border-0">نشط</Badge>
                      : <Badge className="bg-destructive/15 text-destructive border-0">غير نشط</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(o)}><Edit className="h-3.5 w-3.5 ml-1" />تعديل</Button>
                      <Button size="sm" variant="ghost" className={o.active ? "text-destructive" : "text-success"} onClick={() => toggle(o)}>
                        <Power className="h-3.5 w-3.5 ml-1" />{o.active ? "إلغاء تفعيل" : "تفعيل"}
                      </Button>
                      {!o.builtin && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(o)}>
                          <Trash2 className="h-3.5 w-3.5 ml-1" />حذف
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد جهات.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && <OrgDialog title="تعديل الجهة" initial={editing} onSave={(p) => update(editing, p)} />}
      </Dialog>
    </div>
  );
}

function OrgDialog({ title, initial, onSave }: { title: string; initial?: OrgRecord; onSave: (p: Payload) => void }) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [isBank, setIsBank] = useState(initial?.isBank ?? false);
  const valid = label.trim().length > 0;
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>عرّف اسم الجهة كما سيظهر في القوائم المنسدلة عبر النظام.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم الجهة *</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: شركات الصرافة" />
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-info" />
            <div>
              <Label className="cursor-pointer">بنوك</Label>
              <p className="text-[11px] text-muted-foreground">حدّد إذا كانت هذه الجهة بنكاً (مثل: الصرافات).</p>
            </div>
          </div>
          <Switch checked={isBank} onCheckedChange={setIsBank} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!valid} onClick={() => valid && onSave({ label: label.trim(), isBank })}>
          {initial ? "حفظ التعديلات" : "إضافة الجهة"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
