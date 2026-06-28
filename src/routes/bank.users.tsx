import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Users as UsersIcon,
  Edit,
  Search,
  Power,
  ShieldCheck,
  Wand2,
  type LucideIcon,
} from "lucide-react";
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
import { useAuth, type User, type RoleId } from "@/lib/mock";
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
import { useUsers, useUserMutations } from "@/lib/data/users";
import { useRoles } from "@/lib/data/roles";
import { useTeams } from "@/lib/data/teams";
import { generatePassword } from "@/lib/utils";

export const Route = createFileRoute("/bank/users")({ component: BankUsers });

function BankUsers() {
  const { user } = useAuth();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const { data: allRoles = [] } = useRoles();
  const roles = useMemo(() => allRoles.filter((r) => r.active && r.orgCode === "bank"), [allRoles]);
  const { data: teams = [] } = useTeams();
  const [roleFilter, setRoleFilter] = useState<"all" | RoleId>("all");
  const bankId = user?.bankId ?? null;
  const bankName = user?.bank?.name;
  const { data: bankUsers, isLoading } = useUsers(bankId !== null ? { bankId } : undefined);
  const auditCtx = user
    ? { userId: String(user.id), userName: user.name, role: user.roleId }
    : undefined;
  const mutations = useUserMutations(auditCtx);

  const list = useMemo(() => {
    if (!bankUsers) return [];
    const s = q.trim().toLowerCase();
    return bankUsers
      .filter((u) => roleFilter === "all" || u.roleId === roleFilter)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [bankUsers, q, roleFilter]);

  const stats = useMemo(() => {
    if (!bankUsers) return { total: 0, active: 0, inactive: 0 };
    return {
      total: bankUsers.length,
      active: bankUsers.filter((u) => u.isActive !== false).length,
      inactive: bankUsers.filter((u) => u.isActive === false).length,
    };
  }, [bankUsers]);

  if (!user) return null;
  if (user.roleId !== "rc_bank_admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">هذه الصفحة مخصصة لمسؤول الجهة فقط.</div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground text-sm">جاري التحميل...</span>
      </div>
    );
  }

  function toggleActive(u: User) {
    const next = u.isActive === false;
    mutations.toggleUser
      .mutate({ id: u.id, activate: next })
      .then(() => {
        toast.success(next ? `تم تفعيل ${u.name}` : `تم إلغاء تفعيل ${u.name}`);
      })
      .catch(() => toast.error("فشل تغيير حالة المستخدم"));
  }

  return (
    <div>
      <PageHeader
        title="موظفو الجهة"
        subtitle={`إدارة موظفي ${bankName ?? ""} وتعيين الأدوار الفرعية`}
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "موظفو الجهة" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> موظف جديد
              </Button>
            </DialogTrigger>
            <UserDialog
              title="إضافة موظف للجهة"
              roles={roles}
              onSave={(payload) => {
                const team = teams.find((t) => t.roleCode === payload.roleId);
                mutations.createUser
                  .mutate({
                    name: payload.name,
                    email: payload.email,
                    phone: payload.phone,
                    password: payload.password,
                    roleId: payload.roleId,
                    organizationCode: user!.organization?.code ?? "bank",
                    teamCode: team?.code,
                    bankId: user!.bankId,
                    _mock: {
                      organization: user!.organization,
                      team: team ? { id: team.id, code: team.code, name: team.label } : null,
                      bank: user!.bank,
                      roleLabel: roles.find((r) => r.code === payload.roleId)?.name,
                    },
                  })
                  .then(() => {
                    toast.success(`تمت إضافة ${payload.name}`);
                    setOpenAdd(false);
                  })
                  .catch(() => toast.error("فشل إضافة المستخدم"));
              }}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard
          label="إجمالي الموظفين"
          value={stats.total}
          icon={UsersIcon}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          label="نشط"
          value={stats.active}
          icon={ShieldCheck}
          tone="bg-success/10 text-success"
        />
        <StatCard
          label="غير نشط"
          value={stats.inactive}
          icon={Power}
          tone="bg-destructive/10 text-destructive"
        />
      </div>

      <Card className="p-4 mb-4 shadow-card border-0 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-10"
            aria-label="بحث في موظفي الجهة"
            placeholder="بحث بالاسم أو البريد..."
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | RoleId)}>
          <SelectTrigger className="w-full sm:w-56" aria-label="تصفية الموظفين حسب الدور">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.code}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="text-right">
                <th scope="col" className="px-4 py-3">
                  الموظف
                </th>
                <th scope="col" className="px-4 py-3">
                  البريد
                </th>
                <th scope="col" className="px-4 py-3">
                  الدور
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
              {list.map((u) => (
                <tr key={u.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
                        {u.avatar}
                      </div>
                      <div>
                        <div className="font-medium">{u.name}</div>
                        {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">
                      {roles.find((role) => role.code === u.roleId)?.name ?? u.roleId}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive === false ? (
                      <Badge className="bg-destructive/15 text-destructive border-0">غير نشط</Badge>
                    ) : (
                      <Badge className="bg-success/15 text-success border-0">نشط</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        <Edit className="h-3.5 w-3.5 ml-1" /> تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={u.isActive === false ? "text-success" : "text-destructive"}
                        onClick={() => toggleActive(u)}
                        disabled={u.id === user.id}
                        title={u.id === user.id ? "لا يمكنك تعطيل حسابك" : ""}
                      >
                        <Power className="h-3.5 w-3.5 ml-1" />
                        {u.isActive === false ? "تفعيل" : "إلغاء تفعيل"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    {stats.total === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                          <UsersIcon className="h-5 w-5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          لا يوجد موظفون بعد. أضف أول موظف للجهة وعيّن دوره الفرعي.
                        </p>
                        <Button size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus className="h-4 w-4 ml-1" /> موظف جديد
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        لا يوجد موظفون مطابقون لبحثك.
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
          <UserDialog
            title="تعديل بيانات الموظف"
            initial={editing}
            roles={roles}
            onSave={(payload) => {
              const team = teams.find((t) => t.roleCode === payload.roleId);
              mutations.updateUser
                .mutate({
                  id: editing.id,
                  name: payload.name,
                  email: payload.email,
                  phone: payload.phone,
                  password: payload.password,
                  roleId: payload.roleId,
                  teamCode: team?.code,
                  version: editing._version,
                  _mock: {
                    team: team ? { id: team.id, code: team.code, name: team.label } : null,
                    roleLabel: roles.find((r) => r.code === payload.roleId)?.name,
                  },
                })
                .then(() => {
                  toast.success("تم حفظ التعديلات");
                  setEditing(null);
                })
                .catch(() => toast.error("فشل حفظ التعديلات"));
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Card className="p-4 shadow-card border-0">
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

type UserPayload = {
  name: string;
  email: string;
  roleId: RoleId;
  phone?: string;
  password?: string;
};

function UserDialog({
  title,
  initial,
  roles,
  onSave,
}: {
  title: string;
  initial?: User;
  roles: { id: number; code: string; name: string }[];
  onSave: (u: UserPayload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<RoleId>(
    initial?.roleId ?? (roles[0]?.code as RoleId) ?? "rc_bank_intake",
  );
  const valid =
    name.trim() && /\S+@\S+\.\S+/.test(email) && (!!initial || password.trim().length >= 8);

  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          الفصل بين الإدخال والمراجعة الداخلية مفروض تلقائياً على نفس الطلب.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>الاسم *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>البريد الإلكتروني *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>الهاتف</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9677…" />
        </div>
        <div className="space-y-1.5">
          <Label>{initial ? "كلمة المرور (اختياري)" : "كلمة المرور *"}</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={initial ? "اتركه فارغاً لعدم التغيير" : "8 أحرف على الأقل"}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="توليد كلمة مرور"
              onClick={() => setPassword(generatePassword())}
            >
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>الدور الفرعي *</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.code}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            valid &&
            onSave({
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              password: password.trim() || undefined,
              roleId,
            })
          }
          disabled={!valid}
        >
          {initial ? "حفظ التعديلات" : "إضافة الموظف"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
