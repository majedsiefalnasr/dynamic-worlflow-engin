import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  UserCog,
  Edit,
  Power,
  Search,
  ShieldCheck,
  Eye,
  Building2,
  Landmark,
  KeyRound,
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
import { DEMO_USERS, saveUsers, useAuth, computeAvatar, getRoleLabel, type User } from "@/lib/mock";
import {
  entitiesCell,
  logAudit,
  teamsCell,
  orgsCell,
  roleCatalogCell,
  getTeamLabel,
  getOrgLabel,
} from "@/lib/governance";
import { upsertWorkflowUser } from "@/lib/workflow-bridge";
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

export const Route = createFileRoute("/admin/cby-staff")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <SystemUsers />
    </RoleGuard>
  ),
});

type Payload = {
  name: string;
  email: string;
  phone?: string;
  orgId: string;
  teamId: string;
  roleId: string; // role catalog id
  entityId: string | null;
};

function SystemUsers() {
  const { user } = useAuth();
  const banks = entitiesCell.use();
  const teams = teamsCell.use();
  const orgs = orgsCell.use();
  const roles = roleCatalogCell.use();
  const [version, setVersion] = useState(0);
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");

  const list = useMemo(() => {
    void version;
    const s = q.trim().toLowerCase();
    return DEMO_USERS.filter(
      (u) => orgFilter === "all" || u.organization?.code === orgFilter,
    ).filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [version, q, orgFilter]);

  const stats = useMemo(() => {
    void version;
    return {
      total: DEMO_USERS.length,
      bank: DEMO_USERS.filter((u) => u.organization?.code === "bank").length,
      committee: DEMO_USERS.filter((u) => u.organization?.code === "committee").length,
      inactive: DEMO_USERS.filter((u) => u.isActive === false).length,
    };
  }, [version]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  function orgLabelFor(p: Payload): string {
    const teamLabel = getTeamLabel(p.teamId);
    const orgLabel = getOrgLabel(p.orgId);
    if (p.orgId === "bank" && p.entityId) {
      const b = banks.find((e) => e.id === p.entityId);
      if (b) return `${b.name}، ${teamLabel}`;
    }
    return `${orgLabel}، ${teamLabel}`;
  }

  function buildUserFields(p: Payload) {
    const team = teams.find((t) => t.code === p.teamId);
    const org = orgs.find((o) => o.code === p.orgId);
    const bankIndex =
      p.orgId === "bank" && p.entityId ? banks.findIndex((e) => e.id === p.entityId) : -1;
    const bankEntity = bankIndex >= 0 ? banks[bankIndex] : undefined;
    return {
      organization: org ? { id: org.id, code: org.code, name: org.label } : null,
      team: team ? { id: team.id, code: team.code, name: team.label } : null,
      bank: bankEntity ? { id: bankIndex + 1, code: bankEntity.id, name: bankEntity.name } : null,
      bankId: bankEntity ? bankIndex + 1 : null,
    };
  }

  function add(p: Payload) {
    const u: User = {
      id: Date.now(),
      name: p.name,
      email: p.email,
      phone: p.phone,
      roleId: p.roleId,
      roleLabel: roles.find((r) => r.code === p.roleId)?.name ?? getRoleLabel(p.roleId),
      role: null,
      ...buildUserFields(p),
      avatar: computeAvatar(p.name),
      isActive: true,
      screenPermissions: [],
      capabilities: [],
    };
    DEMO_USERS.push(u);
    upsertWorkflowUser(u);
    saveUsers();
    if (user)
      logAudit({
        userId: String(user.id),
        userName: user.name,
        role: user.roleId,
        action: "إضافة مستخدم نظام",
        ref: u.email,
        notes: `${u.name}، ${orgLabelFor(p)}`,
      });
    toast.success(`تمت إضافة ${u.name}`);
    refresh();
    setOpenAdd(false);
  }

  function update(target: User, p: Payload) {
    const idx = DEMO_USERS.findIndex((x) => x.id === target.id);
    if (idx < 0) return;
    DEMO_USERS[idx] = {
      ...DEMO_USERS[idx],
      name: p.name,
      email: p.email,
      phone: p.phone,
      roleId: p.roleId,
      roleLabel: roles.find((r) => r.code === p.roleId)?.name ?? getRoleLabel(p.roleId),
      ...buildUserFields(p),
      avatar: computeAvatar(p.name),
    };
    upsertWorkflowUser(DEMO_USERS[idx]);
    saveUsers();
    if (user)
      logAudit({
        userId: String(user.id),
        userName: user.name,
        role: user.roleId,
        action: "تعديل بيانات مستخدم",
        ref: target.email,
        notes: p.name,
      });
    toast.success("تم حفظ التعديلات");
    refresh();
    setEditing(null);
  }

  function toggleActive(u: User) {
    const idx = DEMO_USERS.findIndex((x) => x.id === u.id);
    if (idx < 0) return;
    const next = u.isActive === false;
    DEMO_USERS[idx] = { ...DEMO_USERS[idx], isActive: next };
    saveUsers();
    if (user)
      logAudit({
        userId: String(user.id),
        userName: user.name,
        role: user.roleId,
        action: next ? "تفعيل مستخدم" : "إلغاء تفعيل مستخدم",
        ref: u.email,
        notes: u.name,
      });
    toast.success(next ? `تم تفعيل ${u.name}` : `تم إلغاء تفعيل ${u.name}`);
    refresh();
  }

  function deriveInitialRoleId(u: User): string {
    return roles.some((r) => r.code === u.roleId) ? u.roleId : (roles[0]?.code ?? "");
  }

  function roleLabelFor(u: User): string {
    return roles.find((r) => r.code === u.roleId)?.name ?? u.roleId;
  }

  return (
    <div>
      <PageHeader
        title="مستخدمي النظام"
        subtitle="إدارة مستخدمي كل الجهات. يحدّد مسؤول النظام الجهة والفريق والدور لكل مستخدم."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "مستخدمي النظام" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> مستخدم جديد
              </Button>
            </DialogTrigger>
            <UserDialog
              title="إضافة مستخدم جديد"
              banks={banks}
              orgs={orgs.filter((o) => o.active)}
              teams={teams.filter((t) => t.active)}
              roles={roles.filter((r) => r.active)}
              onSave={add}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="إجمالي المستخدمين"
          value={stats.total}
          icon={UserCog}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          label="بنوك تجارية"
          value={stats.bank}
          icon={Building2}
          tone="bg-info/10 text-info"
        />
        <StatCard
          label="اللجنة الوطنية"
          value={stats.committee}
          icon={Landmark}
          tone="bg-accent/10 text-accent"
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
            aria-label="بحث في مستخدمي النظام"
            placeholder="بحث بالاسم أو البريد..."
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-full sm:w-64" aria-label="تصفية المستخدمين حسب الجهة">
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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="text-right">
                <th scope="col" className="px-4 py-3">
                  المستخدم
                </th>
                <th scope="col" className="px-4 py-3">
                  البريد
                </th>
                <th scope="col" className="px-4 py-3">
                  الجهة / الفريق
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
                  <td className="px-4 py-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      {u.organization?.code === "bank" ? (
                        <Building2 className="h-3.5 w-3.5 text-info" />
                      ) : u.organization?.code === "committee" ? (
                        <Landmark className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      )}
                      <span>{u.organization?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{roleLabelFor(u)}</Badge>
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
                      <Button size="sm" variant="ghost" onClick={() => setViewing(u)}>
                        <Eye className="h-3.5 w-3.5 ml-1" />
                        عرض
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        <Edit className="h-3.5 w-3.5 ml-1" />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={u.isActive === false ? "text-success" : "text-destructive"}
                        onClick={() => toggleActive(u)}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? "لا يمكنك تعطيل حسابك" : ""}
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
                  <td colSpan={6} className="px-4 py-12 text-center">
                    {DEMO_USERS.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                          <UserCog className="h-5 w-5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          لا يوجد مستخدمون بعد. أضف أول مستخدم وحدّد جهته وفريقه ودوره.
                        </p>
                        <Button size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus className="h-4 w-4 ml-1" /> مستخدم جديد
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        لا يوجد مستخدمون مطابقون لبحثك.
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
            title="تعديل بيانات المستخدم"
            initial={editing}
            initialRoleId={deriveInitialRoleId(editing)}
            banks={banks}
            orgs={orgs.filter((o) => o.active)}
            teams={teams.filter((t) => t.active)}
            roles={roles.filter((r) => r.active)}
            onSave={(p) => update(editing, p)}
          />
        )}
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing && (
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" /> {viewing.name}
              </DialogTitle>
              <DialogDescription>تفاصيل المستخدم</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <Row label="البريد" value={viewing.email} />
              <Row label="الجهة" value={viewing.organization?.name ?? "—"} />
              <Row label="الفريق" value={getTeamLabel(viewing.team?.code)} />
              <Row label="الدور" value={roleLabelFor(viewing)} />
              <Row label="الهاتف" value={viewing.phone ?? "—"} />
              <Row label="الحالة" value={viewing.isActive === false ? "غير نشط" : "نشط"} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-left">{value}</span>
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

function UserDialog({
  title,
  initial,
  initialRoleId,
  banks,
  orgs,
  teams,
  roles,
  onSave,
}: {
  title: string;
  initial?: User;
  initialRoleId?: string;
  banks: { id: string; name: string }[];
  orgs: { id: number; code: string; label: string }[];
  teams: { id: number; code: string; label: string; orgCode: string }[];
  roles: { id: number; code: string; name: string; orgCode: string }[];
  onSave: (p: Payload) => void;
}) {
  const defaultOrg = initial?.organization?.code ?? orgs[0]?.code ?? "bank";
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [orgId, setOrgId] = useState<string>(defaultOrg);
  const [entityId, setEntityId] = useState<string | null>(
    banks.find((b) => b.name === initial?.bank?.name)?.id ??
      (defaultOrg === "bank" ? (banks[0]?.id ?? null) : null),
  );

  const teamsForOrg = teams.filter((t) => t.orgCode === orgId);
  const rolesForOrg = roles.filter((r) => r.orgCode === orgId);

  const [teamId, setTeamId] = useState<string>(initial?.team?.code ?? teamsForOrg[0]?.code ?? "");
  const [roleId, setRoleId] = useState<string>(initialRoleId ?? rolesForOrg[0]?.code ?? "");

  function switchOrg(next: string) {
    setOrgId(next);
    const nt = teams.filter((t) => t.orgCode === next);
    const nr = roles.filter((r) => r.orgCode === next);
    setTeamId(nt[0]?.code ?? "");
    setRoleId(nr[0]?.code ?? "");
    if (next === "bank") {
      if (!entityId) setEntityId(banks[0]?.id ?? null);
    } else {
      setEntityId(null);
    }
  }

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const needsBank = orgId === "bank";
  const valid =
    name.trim() && emailOk && !!orgId && !!teamId && !!roleId && (!needsBank || !!entityId);

  return (
    <DialogContent dir="rtl" className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          يحدّد مسؤول النظام الجهة والفريق والدور لكل مستخدم. تُستخدم هذه الإعدادات في صفحة الدخول
          وصلاحيات سير العمل.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الاسم *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني *</Label>
            <Input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>الهاتف</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9677…" />
        </div>

        <div className="space-y-1.5">
          <Label>الجهة *</Label>
          <Select value={orgId} onValueChange={switchOrg}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الجهة..." />
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

        {needsBank && (
          <div className="space-y-1.5">
            <Label>البنك التجاري *</Label>
            <Select value={entityId ?? ""} onValueChange={(v) => setEntityId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر البنك..." />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {banks.length === 0 && (
              <p className="text-xs text-destructive">
                لا توجد بنوك معرفة. أضف بنكاً من شاشة "إدارة البنوك" أولاً.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الفريق *</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفريق..." />
              </SelectTrigger>
              <SelectContent>
                {teamsForOrg.map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teamsForOrg.length === 0 && (
              <p className="text-xs text-destructive">لا توجد فرق نشطة لهذه الجهة.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>الدور *</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="اختر الدور..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                {rolesForOrg.map((r) => (
                  <SelectItem key={r.id} value={r.code}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rolesForOrg.length === 0 && (
              <p className="text-xs text-destructive">
                لا توجد أدوار نشطة لهذه الجهة. أضف من شاشة "إدارة الأدوار".
              </p>
            )}
          </div>
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
              orgId,
              teamId,
              roleId,
              entityId: needsBank ? entityId : null,
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
