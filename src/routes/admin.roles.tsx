import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Edit, Power, Search, Trash2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  roleCatalogCell,
  orgsCell,
  getOrgLabel,
  logAudit,
  type RoleCatalogEntry,
} from "@/lib/governance";
import { DEMO_USERS, useAuth } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/roles")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <RolesAdmin />
    </RoleGuard>
  ),
});

type Payload = { name: string; orgCode: string };

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
      .filter((r) => orgFilter === "all" || r.orgCode === orgFilter)
      .filter((r) => !s || r.name.toLowerCase().includes(s));
  }, [roles, q, orgFilter]);

  const usersByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of DEMO_USERS) counts[u.roleId] = (counts[u.roleId] ?? 0) + 1;
    return counts;
  }, []);

  function audit(action: string, ref: string, notes?: string) {
    if (user)
      logAudit({
        userId: String(user.id),
        userName: user.name,
        role: user.roleId,
        action,
        ref,
        notes,
      });
  }

  function add(p: Payload) {
    const code = `rc_${Date.now()}`;
    const org = orgs.find((o) => o.code === p.orgCode);
    const nextId = Math.max(0, ...roles.map((r) => r.id)) + 1;
    roleCatalogCell.set((prev) => [
      ...prev,
      {
        id: nextId,
        code,
        name: p.name,
        orgId: org?.id ?? 0,
        orgCode: p.orgCode,
        active: true,
        builtin: false,
      },
    ]);
    audit("إضافة دور", code, p.name);
    toast.success(`تمت إضافة الدور "${p.name}"`);
    setOpenAdd(false);
  }

  function update(target: RoleCatalogEntry, p: Payload) {
    const org = orgs.find((o) => o.code === p.orgCode);
    roleCatalogCell.set((prev) =>
      prev.map((r) =>
        r.code === target.code
          ? { ...r, name: p.name, orgCode: p.orgCode, orgId: org?.id ?? r.orgId }
          : r,
      ),
    );
    audit("تعديل دور", target.code, p.name);
    toast.success("تم حفظ التعديلات");
    setEditing(null);
  }

  function toggle(r: RoleCatalogEntry) {
    roleCatalogCell.set((prev) =>
      prev.map((x) => (x.code === r.code ? { ...x, active: !x.active } : x)),
    );
    audit(r.active ? "إلغاء تفعيل دور" : "تفعيل دور", r.code, r.name);
    toast.success(r.active ? `تم إلغاء تفعيل "${r.name}"` : `تم تفعيل "${r.name}"`);
  }

  function remove(r: RoleCatalogEntry) {
    if (r.builtin) return toast.error("لا يمكن حذف دور افتراضي. يمكنك إلغاء تفعيله.");
    roleCatalogCell.set((prev) => prev.filter((x) => x.code !== r.code));
    audit("حذف دور", r.code, r.name);
    toast.success(`تم حذف "${r.name}"`);
  }

  return (
    <div>
      <PageHeader
        title="إدارة الأدوار"
        subtitle="تعريف الأدوار المتاحة في النظام وربط كل دور بالجهة التابعة له"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة الأدوار" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> دور جديد
              </Button>
            </DialogTrigger>
            <RoleDialog title="إضافة دور جديد" orgs={orgs.filter((o) => o.active)} onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-10"
            aria-label="بحث في الأدوار"
            placeholder="بحث باسم الدور..."
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-full sm:w-64" aria-label="تصفية الأدوار حسب الجهة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الجهات</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.code}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="text-right">
                <th scope="col" className="px-4 py-3">
                  اسم الدور
                </th>
                <th scope="col" className="px-4 py-3">
                  الجهة
                </th>
                <th scope="col" className="px-4 py-3">
                  المستخدمون
                </th>
                <th scope="col" className="px-4 py-3">
                  النوع
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
              {list.map((r) => {
                const userCount = usersByRole[r.code] ?? 0;
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="font-medium">{r.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{getOrgLabel(r.orgCode)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{userCount}</td>
                    <td className="px-4 py-3">
                      {r.builtin ? (
                        <Badge className="bg-info/15 text-info border-0">افتراضي</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-0">مخصّص</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.active ? (
                        <Badge className="bg-success/15 text-success border-0">نشط</Badge>
                      ) : (
                        <Badge className="bg-destructive/15 text-destructive border-0">
                          غير نشط
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Edit className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={r.active ? "text-destructive" : "text-success"}
                          onClick={() => toggle(r)}
                        >
                          <Power className="h-3.5 w-3.5 ml-1" />
                          {r.active ? "إلغاء تفعيل" : "تفعيل"}
                        </Button>
                        {!r.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => remove(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5 ml-1" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    {roles.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                          <KeyRound className="h-5 w-5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          لا توجد أدوار بعد. أضف أول دور لربط المستخدمين بصلاحياتهم في كل جهة.
                        </p>
                        <Button size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus className="h-4 w-4 ml-1" /> دور جديد
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        لا توجد أدوار مطابقة لبحثك.
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
          <RoleDialog
            title="تعديل الدور"
            initial={editing}
            orgs={orgs.filter((o) => o.active)}
            onSave={(p) => update(editing, p)}
          />
        )}
      </Dialog>
    </div>
  );
}

function RoleDialog({
  title,
  initial,
  orgs,
  onSave,
}: {
  title: string;
  initial?: RoleCatalogEntry;
  orgs: { id: number; code: string; label: string }[];
  onSave: (p: Payload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [orgCode, setOrgCode] = useState<string>(initial?.orgCode ?? orgs[0]?.code ?? "bank");
  const valid = name.trim().length > 0 && orgCode;
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>اسم الدور والجهة التي يتبعها.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم الدور *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: مدقق أول"
          />
        </div>
        <div className="space-y-1.5">
          <Label>الجهة *</Label>
          <Select value={orgCode} onValueChange={setOrgCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.code}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!valid} onClick={() => valid && onSave({ name: name.trim(), orgCode })}>
          {initial ? "حفظ التعديلات" : "إضافة الدور"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
