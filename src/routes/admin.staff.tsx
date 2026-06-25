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
import { DEMO_USERS, saveUsers, useAuth, type User } from "@/lib/mock";
import {
  entitiesCell,
  logAudit,
  teamsCell,
  orgsCell,
  roleCatalogCell,
  getTeamLabel,
  getOrgLabel,
  type RoleCatalogEntry,
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
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useUsersQuery, useUserMutations } from "@/lib/api/users";
import { useRolesQuery } from "@/lib/api/roles";
import { useTeamsQuery } from "@/lib/api/teams";
import { useOrganizationsQuery } from "@/lib/api/organizations";
import { useBanksQuery } from "@/lib/api/banks";

export const Route = createFileRoute("/admin/staff")({
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function userErr(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/* ------------------------------------------------------------------ */
/*  Controller                                                        */
/* ------------------------------------------------------------------ */

interface StaffController {
  apiEnabled: boolean;
  users: User[];
  banks: { id: string; name: string }[];
  orgs: { id: string; label: string; active: boolean; category?: string }[];
  teams: { id: string; label: string; orgKind: string; active: boolean; code?: string }[];
  roles: { id: string; code?: string; name: string; orgId: string; active: boolean }[];
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  add: (p: Payload) => Promise<void>;
  update: (target: User, p: Payload) => Promise<void>;
  toggleActive: (u: User) => Promise<void>;
}

function useCbyStaffController(orgLabelFor: (p: Payload) => string): StaffController {
  const usersApi = isApiEnabled("users");
  const rolesApi = isApiEnabled("roles");
  const teamsApi = isApiEnabled("teams");
  const orgsApi = isApiEnabled("organizations");
  const banksApi = isApiEnabled("banks");

  // Live-path queries (disabled when API is off)
  const usersQuery = useUsersQuery(usersApi);
  const rolesQuery = useRolesQuery(rolesApi || usersApi);
  const teamsQuery = useTeamsQuery(teamsApi || usersApi);
  const orgsQuery = useOrganizationsQuery(orgsApi || usersApi);
  const banksQuery = useBanksQuery(banksApi || usersApi);
  const m = useUserMutations();

  /* ---- Live path ---- */
  if (usersApi) {
    const apiRoles: RoleCatalogEntry[] = rolesQuery.data ?? [];
    const apiTeams = teamsQuery.data ?? [];
    const apiOrgs = orgsQuery.data ?? [];
    const apiBanks = banksQuery.data ?? [];

    return {
      apiEnabled: true,
      users: usersQuery.data ?? [],
      banks: apiBanks.map((b) => ({ id: b.id, name: b.name })),
      orgs: apiOrgs.map((o) => ({ id: o.id, label: o.label, active: o.active, category: o.category })),
      teams: apiTeams.map((t) => ({
        id: t.id,
        label: t.label,
        orgKind: t.orgKind,
        active: t.active,
        code: t.code,
      })),
      roles: apiRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        orgId: r.orgId,
        active: r.active,
      })),
      isLoading: usersQuery.isLoading,
      error: usersQuery.error,
      busy:
        m.create.isPending || m.update.isPending || m.activate.isPending || m.deactivate.isPending,
      refetch: () => void usersQuery.refetch(),
      add: async (p) => {
        await m.create.mutateAsync({
          name: p.name,
          email: p.email,
          password: "Password@123",
          organizationId: p.orgId,
          teamId: p.teamId,
          roleId: p.roleId,
          bankId: p.entityId ?? undefined,
          phone: p.phone,
        });
      },
      update: async (target, p) => {
        await m.update.mutateAsync({
          id: target.id,
          version: target._version ?? 0,
          name: p.name,
          email: p.email,
          roleId: p.roleId,
          teamId: p.teamId,
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
    users: DEMO_USERS,
    banks: entitiesCell.get().map((e) => ({ id: e.id, name: e.name })),
    orgs: orgsCell.get().map((o) => ({ id: o.id, label: o.label, active: o.active, category: o.category })),
    teams: teamsCell
      .get()
      .map((t) => ({ id: t.id, label: t.label, orgKind: t.orgKind, active: t.active })),
    roles: roleCatalogCell
      .get()
      .map((r) => ({ id: r.id, name: r.name, orgId: r.orgId, active: r.active })),
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    add: async (p) => {
      const u: User = {
        id: `u${Date.now()}`,
        name: p.name,
        email: p.email,
        phone: p.phone,
        roleId: p.roleId,
        orgKind: p.orgId,
        teamId: p.teamId,
        entityId: p.orgId === "bank" ? p.entityId : null,
        org: orgLabelFor(p),
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
      if (idx < 0) return;
      DEMO_USERS[idx] = {
        ...DEMO_USERS[idx],
        name: p.name,
        email: p.email,
        phone: p.phone,
        roleId: p.roleId,
        orgKind: p.orgId,
        teamId: p.teamId,
        entityId: p.orgId === "bank" ? p.entityId : null,
        org: orgLabelFor(p),
        avatar: p.name
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2),
      };
      upsertWorkflowUser(DEMO_USERS[idx]);
      saveUsers();
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

function SystemUsers() {
  const { user } = useAuth();
  // Mock-mode cells — always called for hook-rule compliance; in API mode the
  // controller's query data drives the lists instead (see ctrl.banks/orgs/teams/roles).
  entitiesCell.use();
  teamsCell.use();
  orgsCell.use();
  roleCatalogCell.use();
  const [version, setVersion] = useState(0);
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");

  function orgLabelFor(p: Payload): string {
    const teamLabel = getTeamLabel(p.teamId);
    const orgLabel = getOrgLabel(p.orgId);
    if (p.orgId === "bank" && p.entityId) {
      const b = entitiesCell.get().find((e) => e.id === p.entityId);
      if (b) return `${b.name}، ${teamLabel}`;
    }
    return `${orgLabel}، ${teamLabel}`;
  }

  const ctrl = useCbyStaffController(orgLabelFor);
  const banks = ctrl.banks;
  const teams = ctrl.teams;
  const orgs = ctrl.orgs;
  const roles = ctrl.roles;

  const list = useMemo(() => {
    void version;
    const s = q.trim().toLowerCase();
    return ctrl.users
      .filter((u) => orgFilter === "all" || u.orgKind === orgFilter)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [ctrl.users, version, q, orgFilter]);

  const stats = useMemo(() => {
    void version;
    const all = ctrl.users;
    return {
      total: all.length,
      bank: all.filter((u) => u.orgKind === "bank").length,
      committee: all.filter((u) => u.orgKind === "committee").length,
      inactive: all.filter((u) => u.active === false).length,
    };
  }, [ctrl.users, version]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  async function add(p: Payload) {
    try {
      await ctrl.add(p);
      if (!ctrl.apiEnabled && user)
        logAudit({
          userId: user.id,
          userName: user.name,
          role: user.roleId,
          action: "إضافة مستخدم نظام",
          ref: p.email,
          notes: `${p.name}، ${orgLabelFor(p)}`,
        });
      toast.success(`تمت إضافة ${p.name}`);
      refresh();
      setOpenAdd(false);
    } catch (error) {
      toast.error(userErr(error, "تعذّرت إضافة المستخدم"));
    }
  }

  async function update(target: User, p: Payload) {
    try {
      await ctrl.update(target, p);
      if (!ctrl.apiEnabled && user)
        logAudit({
          userId: user.id,
          userName: user.name,
          role: user.roleId,
          action: "تعديل بيانات مستخدم",
          ref: target.email,
          notes: p.name,
        });
      toast.success("تم حفظ التعديلات");
      refresh();
      setEditing(null);
    } catch (error) {
      toast.error(userErr(error, "تعذّر حفظ التعديلات"));
    }
  }

  async function toggleActive(u: User) {
    try {
      const next = u.active === false;
      await ctrl.toggleActive(u);
      if (!ctrl.apiEnabled && user)
        logAudit({
          userId: user.id,
          userName: user.name,
          role: user.roleId,
          action: next ? "تفعيل مستخدم" : "إلغاء تفعيل مستخدم",
          ref: u.email,
          notes: u.name,
        });
      toast.success(next ? `تم تفعيل ${u.name}` : `تم إلغاء تفعيل ${u.name}`);
      refresh();
    } catch (error) {
      toast.error(userErr(error, "تعذّر تغيير الحالة"));
    }
  }

  function deriveInitialRoleId(u: User): string {
    const match = roles.find((r) => (r.code ?? r.id) === u.roleId);
    return match ? match.id : (roles[0]?.id ?? "");
  }

  function roleLabelFor(u: User): string {
    return roles.find((r) => (r.code ?? r.id) === u.roleId)?.name ?? u.roleId;
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

      {ctrl.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </div>
      )}

      {!!ctrl.error && (
        <Card className="mb-4 flex flex-col items-center gap-2 border-0 p-6 text-center shadow-card">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {userErr(ctrl.error, "تعذّر تحميل المستخدمين")}
          </p>
          <Button variant="outline" size="sm" onClick={ctrl.refetch}>
            إعادة المحاولة
          </Button>
        </Card>
      )}

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
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {!ctrl.isLoading && !ctrl.error && (
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
                          {u.phone && (
                            <div className="text-xs text-muted-foreground">{u.phone}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        {u.orgKind === "bank" ? (
                          <Building2 className="h-3.5 w-3.5 text-info" />
                        ) : u.orgKind === "committee" ? (
                          <Landmark className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                        <span>{u.org}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{roleLabelFor(u)}</Badge>
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
                          className={u.active === false ? "text-success" : "text-destructive"}
                          onClick={() => toggleActive(u)}
                          disabled={u.id === user?.id}
                          title={u.id === user?.id ? "لا يمكنك تعطيل حسابك" : ""}
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
                    <td colSpan={6} className="px-4 py-12 text-center">
                      {ctrl.users.length === 0 ? (
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
      )}

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
              <Row label="الجهة" value={viewing.org} />
              <Row label="الفريق" value={getTeamLabel(viewing.teamId)} />
              <Row label="الدور" value={roleLabelFor(viewing)} />
              <Row label="الهاتف" value={viewing.phone ?? "—"} />
              <Row label="الحالة" value={viewing.active === false ? "غير نشط" : "نشط"} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Presentational helpers                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  User dialog                                                       */
/* ------------------------------------------------------------------ */

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
  orgs: { id: string; label: string; category?: string }[];
  teams: { id: string; label: string; orgKind: string; code?: string }[];
  roles: { id: string; name: string; orgId: string }[];
  onSave: (p: Payload) => void;
}) {
  const defaultOrg = (() => {
    if (!initial?.orgKind) return orgs[0]?.id ?? "";
    const byCategory = orgs.find((o) => o.category === initial.orgKind);
    if (byCategory) return byCategory.id;
    const byId = orgs.find((o) => o.id === initial.orgKind);
    if (byId) return byId.id;
    return orgs[0]?.id ?? "";
  })();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [orgId, setOrgId] = useState<string>(defaultOrg);
  const defaultNeedsBank = orgs.find((o) => o.id === defaultOrg)?.category === "bank";
  const [entityId, setEntityId] = useState<string | null>(
    initial?.entityId ?? (defaultNeedsBank ? (banks[0]?.id ?? null) : null),
  );

  const teamsForOrg = teams.filter((t) => t.orgKind === orgId);
  const rolesForOrg = roles.filter((r) => r.orgId === orgId);

  const resolvedTeamId = (() => {
    if (!initial?.teamId) return teamsForOrg[0]?.id ?? "";
    const byId = teamsForOrg.find((t) => t.id === initial.teamId);
    if (byId) return byId.id;
    const byCode = teamsForOrg.find((t) => t.code === initial.teamId);
    if (byCode) return byCode.id;
    return teamsForOrg[0]?.id ?? "";
  })();
  const [teamId, setTeamId] = useState<string>(resolvedTeamId);
  const [roleId, setRoleId] = useState<string>(initialRoleId ?? rolesForOrg[0]?.id ?? "");

  function switchOrg(next: string) {
    setOrgId(next);
    const nt = teams.filter((t) => t.orgKind === next);
    const nr = roles.filter((r) => r.orgId === next);
    setTeamId(nt[0]?.id ?? "");
    setRoleId(nr[0]?.id ?? "");
    const isBankOrg = orgs.find((o) => o.id === next)?.category === "bank";
    if (isBankOrg) {
      if (!entityId) setEntityId(banks[0]?.id ?? null);
    } else {
      setEntityId(null);
    }
  }

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const selectedOrg = orgs.find((o) => o.id === orgId);
  const needsBank = selectedOrg?.category === "bank";
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
                <SelectItem key={o.id} value={o.id}>
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
                  <SelectItem key={t.id} value={t.id}>
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
                  <SelectItem key={r.id} value={r.id}>
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
