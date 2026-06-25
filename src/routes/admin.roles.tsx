import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Edit, Power, Search, Trash2, KeyRound, Loader2, AlertCircle } from "lucide-react";
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
  type OrgRecord,
} from "@/lib/governance";
import { DEMO_USERS, useAuth } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useRolesQuery, useRoleMutations } from "@/lib/api/roles";
import { useOrganizationsQuery } from "@/lib/api/organizations";

export const Route = createFileRoute("/admin/roles")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <RolesAdmin />
    </RoleGuard>
  ),
});

type Payload = { name: string; orgId: string };

function roleErr(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface RolesController {
  apiEnabled: boolean;
  roles: RoleCatalogEntry[];
  orgs: OrgRecord[];
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  orgLabel: (orgId: string) => string;
  add: (p: Payload) => Promise<void>;
  update: (target: RoleCatalogEntry, p: Payload) => Promise<void>;
  toggle: (r: RoleCatalogEntry) => Promise<void>;
  remove: (r: RoleCatalogEntry) => Promise<void>;
}

function useRolesController(): RolesController {
  const rolesApi = isApiEnabled("roles");
  const orgsApi = isApiEnabled("organizations");
  const cellRoles = roleCatalogCell.use();
  const cellOrgs = orgsCell.use();
  const rolesQuery = useRolesQuery(rolesApi);
  const orgsQuery = useOrganizationsQuery(orgsApi);
  const m = useRoleMutations();

  const orgs = orgsApi ? (orgsQuery.data ?? []) : cellOrgs;

  if (rolesApi) {
    return {
      apiEnabled: true,
      roles: rolesQuery.data ?? [],
      orgs,
      isLoading: rolesQuery.isLoading,
      error: rolesQuery.error,
      busy:
        m.create.isPending || m.update.isPending || m.activate.isPending || m.deactivate.isPending,
      refetch: () => void rolesQuery.refetch(),
      orgLabel: (id) => orgs.find((o) => o.id === id)?.label ?? "—",
      add: async (p) =>
        void (await m.create.mutateAsync({ organizationId: p.orgId, name: p.name })),
      update: async (target, p) =>
        void (await m.update.mutateAsync({ id: target.id, version: target._version ?? 0, name: p.name })),
      toggle: async (r) => void (await (r.active ? m.deactivate : m.activate).mutateAsync({ id: r.id, version: r._version ?? 0 })),
      remove: async (r) => void (await m.deactivate.mutateAsync({ id: r.id, version: r._version ?? 0 })), // no hard delete server-side
    };
  }

  return {
    apiEnabled: false,
    roles: cellRoles,
    orgs: cellOrgs,
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    orgLabel: (id) => getOrgLabel(id),
    add: async (p) => {
      const id = `rc_${Date.now()}`;
      roleCatalogCell.set((prev) => [...prev, { id, ...p, active: true }]);
    },
    update: async (target, p) => {
      roleCatalogCell.set((prev) => prev.map((r) => (r.id === target.id ? { ...r, ...p } : r)));
    },
    toggle: async (r) => {
      roleCatalogCell.set((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)),
      );
    },
    remove: async (r) => {
      roleCatalogCell.set((prev) => prev.filter((x) => x.id !== r.id));
    },
  };
}

function RolesAdmin() {
  const { user } = useAuth();
  const ctrl = useRolesController();
  const roles = ctrl.roles;
  const orgs = ctrl.orgs;
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<RoleCatalogEntry | null>(null);

  const s = q.trim().toLowerCase();
  const list = roles
    .filter((r) => orgFilter === "all" || r.orgId === orgFilter)
    .filter((r) => !s || r.name.toLowerCase().includes(s));

  const usersByRole: Record<string, number> = {};
  for (const u of DEMO_USERS) usersByRole[u.roleId] = (usersByRole[u.roleId] ?? 0) + 1;

  function audit(action: string, ref: string, notes?: string) {
    if (!ctrl.apiEnabled && user)
      logAudit({ userId: user.id, userName: user.name, role: user.roleId, action, ref, notes });
  }

  async function add(p: Payload) {
    try {
      await ctrl.add(p);
      audit("إضافة دور", p.name, p.name);
      toast.success(`تمت إضافة الدور "${p.name}"`);
      setOpenAdd(false);
    } catch (error) {
      toast.error(roleErr(error, "تعذّرت إضافة الدور"));
    }
  }

  async function update(target: RoleCatalogEntry, p: Payload) {
    try {
      await ctrl.update(target, p);
      audit("تعديل دور", target.id, p.name);
      toast.success("تم حفظ التعديلات");
      setEditing(null);
    } catch (error) {
      toast.error(roleErr(error, "تعذّر حفظ التعديلات"));
    }
  }

  async function toggle(r: RoleCatalogEntry) {
    try {
      await ctrl.toggle(r);
      audit(r.active ? "إلغاء تفعيل دور" : "تفعيل دور", r.id, r.name);
      toast.success(r.active ? `تم إلغاء تفعيل "${r.name}"` : `تم تفعيل "${r.name}"`);
    } catch (error) {
      toast.error(roleErr(error, "تعذّر تغيير الحالة"));
    }
  }

  async function remove(r: RoleCatalogEntry) {
    if (r.builtin) return toast.error("لا يمكن حذف دور افتراضي. يمكنك إلغاء تفعيله.");
    try {
      await ctrl.remove(r);
      audit("حذف دور", r.id, r.name);
      toast.success(`تم حذف "${r.name}"`);
    } catch (error) {
      toast.error(roleErr(error, "تعذّر حذف الدور"));
    }
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
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
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
            {roleErr(ctrl.error, "تعذّر تحميل الأدوار")}
          </p>
          <Button variant="outline" size="sm" onClick={ctrl.refetch}>
            إعادة المحاولة
          </Button>
        </Card>
      )}

      {!ctrl.isLoading && !ctrl.error && (
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
                {list.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="font-medium">{r.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{ctrl.orgLabel(r.orgId)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {ctrl.apiEnabled ? "—" : (usersByRole[r.id] ?? 0)}
                    </td>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(r)}
                          disabled={ctrl.busy}
                        >
                          <Edit className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={r.active ? "text-destructive" : "text-success"}
                          onClick={() => toggle(r)}
                          disabled={ctrl.busy}
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
                            disabled={ctrl.busy}
                          >
                            <Trash2 className="h-3.5 w-3.5 ml-1" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
      )}

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
  orgs: { id: string; label: string }[];
  onSave: (p: Payload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [orgId, setOrgId] = useState<string>(initial?.orgId ?? orgs[0]?.id ?? "");
  const valid = name.trim().length > 0 && !!orgId;
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
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!valid} onClick={() => valid && onSave({ name: name.trim(), orgId })}>
          {initial ? "حفظ التعديلات" : "إضافة الدور"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
