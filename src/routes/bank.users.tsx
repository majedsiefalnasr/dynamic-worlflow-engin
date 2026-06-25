import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Users as UsersIcon,
  Edit,
  Search,
  Power,
  ShieldCheck,
  Loader2,
  AlertCircle,
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
import { DEMO_USERS, saveUsers, useAuth, ENTITIES, type User, type RoleId } from "@/lib/mock";
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
import { logAudit, roleCatalogCell, teamsCell, type RoleCatalogEntry } from "@/lib/governance";
import { upsertWorkflowUser } from "@/lib/workflow-bridge";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useUsersQuery, useUserMutations } from "@/lib/api/users";
import { useRolesQuery } from "@/lib/api/roles";
import { useTeamsQuery } from "@/lib/api/teams";

export const Route = createFileRoute("/bank/users")({ component: BankUsers });

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function userErr(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

type RolesView = { id: string; code?: string; name: string }[];

/* ------------------------------------------------------------------ */
/*  Controller                                                        */
/* ------------------------------------------------------------------ */

interface BankUsersController {
  apiEnabled: boolean;
  users: User[];
  roles: RolesView;
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  add: (p: UserPayload) => Promise<void>;
  update: (target: User, p: UserPayload) => Promise<void>;
  toggleActive: (u: User) => Promise<void>;
}

function useBankUsersController(entityId: string | null | undefined): BankUsersController {
  const usersApi = isApiEnabled("users");
  const rolesApi = isApiEnabled("roles");
  const teamsApi = isApiEnabled("teams");

  // Mock-path cells (always called — hooks cannot be conditional)
  const cellRoles = roleCatalogCell.use().filter((role) => role.active && role.orgId === "bank");
  const teamsCellData = teamsCell.use();

  // Live-path queries (disabled when API is off)
  const usersQuery = useUsersQuery(usersApi, entityId ? { bankId: entityId } : undefined);
  const rolesQuery = useRolesQuery(rolesApi || usersApi);
  const teamsQuery = useTeamsQuery(teamsApi || usersApi);
  const m = useUserMutations();

  /* ---- Live path ---- */
  if (usersApi) {
    const apiRoles: RoleCatalogEntry[] = rolesQuery.data ?? [];
    const apiTeams = teamsQuery.data ?? [];
    const roles: RolesView = apiRoles.map((r) => ({ id: r.id, code: r.code, name: r.name }));

    return {
      apiEnabled: true,
      users: usersQuery.data ?? [],
      roles,
      isLoading: usersQuery.isLoading,
      error: usersQuery.error,
      busy:
        m.create.isPending || m.update.isPending || m.activate.isPending || m.deactivate.isPending,
      refetch: () => void usersQuery.refetch(),
      add: async (p) => {
        const role = apiRoles.find((r) => r.id === p.roleId);
        const team = apiTeams.find((t) => t.orgKind === role?.orgId);
        await m.create.mutateAsync({
          name: p.name,
          email: p.email,
          password: "Password@123",
          organizationId: role?.orgId ?? "0",
          teamId: team?.id ?? "0",
          roleId: p.roleId,
          bankId: entityId ?? undefined,
          phone: p.phone,
        });
      },
      update: async (target, p) => {
        const role = apiRoles.find((r) => r.id === p.roleId);
        const team = apiTeams.find((t) => t.orgKind === role?.orgId);
        await m.update.mutateAsync({
          id: target.id,
          version: target._version ?? 0,
          name: p.name,
          email: p.email,
          roleId: p.roleId,
          teamId: team?.id ?? "0",
          phone: p.phone,
        });
      },
      toggleActive: async (u) => {
        await (u.active === false ? m.activate : m.deactivate).mutateAsync(u.id);
      },
    };
  }

  /* ---- Mock path ---- */
  return {
    apiEnabled: false,
    users: DEMO_USERS.filter((u) => u.entityId === entityId),
    roles: cellRoles,
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    add: async (p) => {
      const entity = ENTITIES.find((candidate) => candidate.id === entityId);
      const u: User = {
        id: `u${Date.now()}`,
        ...p,
        entityId: entityId ?? null,
        orgKind: "bank",
        teamId: teamsCellData.find((team) => team.roleCode === p.roleId)?.id,
        org: entity?.name ?? "",
        avatar: p.name
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2),
        active: true,
      };
      DEMO_USERS.push(u);
      upsertWorkflowUser(u);
      saveUsers();
    },
    update: async (target, p) => {
      const idx = DEMO_USERS.findIndex((x) => x.id === target.id);
      if (idx >= 0) {
        DEMO_USERS[idx] = {
          ...DEMO_USERS[idx],
          ...p,
          teamId: teamsCellData.find((team) => team.roleCode === p.roleId)?.id,
          avatar: p.name
            .split(" ")
            .map((s) => s[0])
            .join("")
            .slice(0, 2),
        };
        upsertWorkflowUser(DEMO_USERS[idx]);
        saveUsers();
      }
    },
    toggleActive: async (u) => {
      const idx = DEMO_USERS.findIndex((x) => x.id === u.id);
      if (idx < 0) return;
      const next = u.active === false;
      DEMO_USERS[idx] = { ...DEMO_USERS[idx], active: next };
      saveUsers();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

function BankUsers() {
  const { user } = useAuth();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RoleId>("all");
  const entityId = user?.entityId;
  const entity = ENTITIES.find((candidate) => candidate.id === entityId);
  const ctrl = useBankUsersController(entityId);
  const roles = ctrl.roles;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ctrl.users
      .filter((u) => roleFilter === "all" || u.roleId === roleFilter)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [ctrl.users, q, roleFilter]);

  const stats = useMemo(() => {
    const all = ctrl.users;
    return {
      total: all.length,
      active: all.filter((u) => u.active !== false).length,
      inactive: all.filter((u) => u.active === false).length,
    };
  }, [ctrl.users]);

  if (!user) return null;
  if (user.roleId !== "rc_bank_admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">هذه الصفحة مخصصة لمسؤول الجهة فقط.</div>
    );
  }

  async function add(payload: UserPayload) {
    try {
      await ctrl.add(payload);
      if (!ctrl.apiEnabled)
        logAudit({
          userId: user!.id,
          userName: user!.name,
          role: user!.roleId,
          action: "إضافة موظف للجهة",
          ref: payload.email,
          notes: `${payload.name}، ${roles.find((role) => role.id === payload.roleId)?.name ?? payload.roleId}`,
        });
      toast.success(`تمت إضافة ${payload.name}`);
      setOpenAdd(false);
    } catch (error) {
      toast.error(userErr(error, "تعذّرت إضافة الموظف"));
    }
  }

  async function update(target: User, payload: UserPayload) {
    try {
      await ctrl.update(target, payload);
      if (!ctrl.apiEnabled)
        logAudit({
          userId: user!.id,
          userName: user!.name,
          role: user!.roleId,
          action: "تعديل بيانات موظف",
          ref: target.email,
          notes: payload.name,
        });
      toast.success("تم حفظ التعديلات");
      setEditing(null);
    } catch (error) {
      toast.error(userErr(error, "تعذّر حفظ التعديلات"));
    }
  }

  async function toggleActive(u: User) {
    try {
      const next = u.active === false;
      await ctrl.toggleActive(u);
      if (!ctrl.apiEnabled)
        logAudit({
          userId: user!.id,
          userName: user!.name,
          role: user!.roleId,
          action: next ? "تفعيل موظف" : "إلغاء تفعيل موظف",
          ref: u.email,
          notes: u.name,
        });
      toast.success(next ? `تم تفعيل ${u.name}` : `تم إلغاء تفعيل ${u.name}`);
    } catch (error) {
      toast.error(userErr(error, "تعذّر تغيير الحالة"));
    }
  }

  return (
    <div>
      <PageHeader
        title="موظفو الجهة"
        subtitle={`إدارة موظفي ${entity?.name ?? ""} وتعيين الأدوار الفرعية`}
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "موظفو الجهة" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> موظف جديد
              </Button>
            </DialogTrigger>
            <UserDialog title="إضافة موظف للجهة" roles={roles} onSave={add} />
          </Dialog>
        }
      />

      {ctrl.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </div>
      )}

      {!!ctrl.error && (
        <Card className="mb-4 flex flex-col items-center gap-2 border-0 p-6 text-center shadow-card">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {userErr(ctrl.error, "تعذّر تحميل الموظفين")}
          </p>
          <Button variant="outline" size="sm" onClick={ctrl.refetch}>
            إعادة المحاولة
          </Button>
        </Card>
      )}

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
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {!ctrl.isLoading && !ctrl.error && (
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
                          {u.phone && (
                            <div className="text-xs text-muted-foreground">{u.phone}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {roles.find((role) => (role.code ?? role.id) === u.roleId)?.name ??
                          u.roleId}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.active === false ? (
                        <Badge className="bg-destructive/15 text-destructive border-0">
                          غير نشط
                        </Badge>
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
                          className={u.active === false ? "text-success" : "text-destructive"}
                          onClick={() => toggleActive(u)}
                          disabled={u.id === user.id}
                          title={u.id === user.id ? "لا يمكنك تعطيل حسابك" : ""}
                        >
                          <Power className="h-3.5 w-3.5 ml-1" />
                          {u.active === false ? "تفعيل" : "إلغاء تفعيل"}
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
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <UserDialog
            title="تعديل بيانات الموظف"
            initial={editing}
            roles={roles}
            onSave={(payload) => update(editing, payload)}
          />
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  User dialog                                                       */
/* ------------------------------------------------------------------ */

type UserPayload = { name: string; email: string; roleId: RoleId; phone?: string };

function UserDialog({
  title,
  initial,
  roles,
  onSave,
}: {
  title: string;
  initial?: User;
  roles: { id: string; name: string }[];
  onSave: (u: UserPayload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [roleId, setRoleId] = useState<RoleId>(initial?.roleId ?? roles[0]?.id ?? "rc_bank_intake");
  const valid = name.trim() && /\S+@\S+\.\S+/.test(email);

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
          <Label>الدور الفرعي *</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
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
