import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  Users as UsersIcon,
  Edit,
  Power,
  Search,
  Building2,
  Landmark,
  ShieldCheck,
  Trash2,
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
  teamsCell,
  orgsCell,
  getOrgLabel,
  getOrgCategory,
  logAudit,
  type TeamRecord,
  type TeamOrgKind,
  type OrgCategory,
  type OrgRecord,
} from "@/lib/governance";
import { DEMO_USERS, useAuth } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { cn } from "@/lib/utils";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useTeamsQuery, useTeamMutations } from "@/lib/api/teams";
import { useOrganizationsQuery } from "@/lib/api/organizations";

export const Route = createFileRoute("/admin/teams")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <TeamsAdmin />
    </RoleGuard>
  ),
});

type Payload = {
  label: string;
  orgKind: TeamOrgKind;
};

function teamError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface TeamsController {
  apiEnabled: boolean;
  teams: TeamRecord[];
  orgs: OrgRecord[];
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  orgLabel: (orgKind: string) => string;
  orgCategory: (orgKind: string) => OrgCategory;
  add: (p: Payload) => Promise<void>;
  update: (target: TeamRecord, p: Payload) => Promise<void>;
  toggle: (t: TeamRecord) => Promise<void>;
  remove: (t: TeamRecord) => Promise<void>;
}

// Teams reference organizations (picker + labels), so the org list is sourced
// from the live backend too whenever `organizations` is enabled.
function useTeamsController(): TeamsController {
  const teamsApi = isApiEnabled("teams");
  const orgsApi = isApiEnabled("organizations");
  const cellTeams = teamsCell.use();
  const cellOrgs = orgsCell.use();
  const teamsQuery = useTeamsQuery(teamsApi);
  const orgsQuery = useOrganizationsQuery(orgsApi);
  const m = useTeamMutations();

  const orgs = orgsApi ? (orgsQuery.data ?? []) : cellOrgs;
  const orgById = (id: string) => orgs.find((o) => o.id === id);

  if (teamsApi) {
    return {
      apiEnabled: true,
      teams: teamsQuery.data ?? [],
      orgs,
      isLoading: teamsQuery.isLoading,
      error: teamsQuery.error,
      busy:
        m.create.isPending || m.update.isPending || m.activate.isPending || m.deactivate.isPending,
      refetch: () => void teamsQuery.refetch(),
      orgLabel: (k) => orgById(k)?.label ?? "—",
      orgCategory: (k) => getOrgCategory(orgById(k) ?? null),
      add: async (p) =>
        void (await m.create.mutateAsync({ organizationId: p.orgKind, name: p.label })),
      update: async (target, p) =>
        void (await m.update.mutateAsync({ id: target.id, version: target._version ?? 0, name: p.label })),
      toggle: async (t) => void (await (t.active ? m.deactivate : m.activate).mutateAsync({ id: t.id, version: t._version ?? 0 })),
      remove: async (t) => void (await m.deactivate.mutateAsync({ id: t.id, version: t._version ?? 0 })), // no hard delete server-side
    };
  }

  return {
    apiEnabled: false,
    teams: cellTeams,
    orgs: cellOrgs,
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    orgLabel: (k) => getOrgLabel(k),
    orgCategory: (k) => getOrgCategory(k),
    add: async (p) => {
      const id = `team_${Date.now()}`;
      teamsCell.set((prev) => [
        ...prev,
        { id, label: p.label, orgKind: p.orgKind, roleCode: "rc_bank_intake", active: true },
      ]);
    },
    update: async (target, p) => {
      teamsCell.set((prev) =>
        prev.map((t) => (t.id === target.id ? { ...t, label: p.label, orgKind: p.orgKind } : t)),
      );
    },
    toggle: async (t) => {
      teamsCell.set((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)));
    },
    remove: async (t) => {
      teamsCell.set((prev) => prev.filter((x) => x.id !== t.id));
    },
  };
}

function TeamsAdmin() {
  const { user } = useAuth();
  const ctrl = useTeamsController();
  const teams = ctrl.teams;
  const orgs = ctrl.orgs;
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | null>(null);

  const s = q.trim().toLowerCase();
  const list = teams
    .filter((t) => orgFilter === "all" || t.orgKind === orgFilter)
    .filter((t) => !s || t.label.toLowerCase().includes(s) || t.id.toLowerCase().includes(s));

  const stats = {
    total: teams.length,
    bank: teams.filter((t) => ctrl.orgCategory(t.orgKind) === "bank").length,
    committee: teams.filter((t) => ctrl.orgCategory(t.orgKind) === "committee").length,
    inactive: teams.filter((t) => !t.active).length,
  };

  function audit(action: string, ref: string, notes?: string) {
    if (!ctrl.apiEnabled && user)
      logAudit({ userId: user.id, userName: user.name, role: user.roleId, action, ref, notes });
  }

  async function add(p: Payload) {
    try {
      await ctrl.add(p);
      audit("إضافة فريق", p.label, p.label);
      toast.success(`تمت إضافة الفريق "${p.label}"`);
      setOpenAdd(false);
    } catch (error) {
      toast.error(teamError(error, "تعذّرت إضافة الفريق"));
    }
  }

  async function update(target: TeamRecord, p: Payload) {
    try {
      await ctrl.update(target, p);
      audit("تعديل فريق", target.id, p.label);
      toast.success("تم حفظ التعديلات");
      setEditing(null);
    } catch (error) {
      toast.error(teamError(error, "تعذّر حفظ التعديلات"));
    }
  }

  async function toggleActive(t: TeamRecord) {
    if (!ctrl.apiEnabled && t.active) {
      const usersInTeam = DEMO_USERS.filter((u) => u.teamId === t.id).length;
      if (usersInTeam > 0) toast.info(`تنبيه: ${usersInTeam} مستخدماً مرتبطاً بهذا الفريق`);
    }
    try {
      await ctrl.toggle(t);
      audit(t.active ? "إلغاء تفعيل فريق" : "تفعيل فريق", t.id, t.label);
      toast.success(t.active ? `تم إلغاء تفعيل "${t.label}"` : `تم تفعيل "${t.label}"`);
    } catch (error) {
      toast.error(teamError(error, "تعذّر تغيير الحالة"));
    }
  }

  async function remove(t: TeamRecord) {
    if (t.builtin) return toast.error("لا يمكن حذف فريق افتراضي. يمكنك إلغاء تفعيله بدلاً من ذلك.");
    if (!ctrl.apiEnabled) {
      const usersInTeam = DEMO_USERS.filter((u) => u.teamId === t.id).length;
      if (usersInTeam > 0)
        return toast.error(`لا يمكن حذف الفريق، يوجد ${usersInTeam} مستخدماً مرتبطاً به.`);
    }
    try {
      await ctrl.remove(t);
      audit("حذف فريق", t.id, t.label);
      toast.success(`تم حذف "${t.label}"`);
    } catch (error) {
      toast.error(teamError(error, "تعذّر حذف الفريق"));
    }
  }

  function orgIcon(category: OrgCategory) {
    if (category === "bank") return <Building2 className="h-3.5 w-3.5 text-info" />;
    if (category === "committee") return <Landmark className="h-3.5 w-3.5 text-accent" />;
    return <ShieldCheck className="h-3.5 w-3.5 text-primary" />;
  }

  return (
    <div>
      <PageHeader
        title="إدارة الفرق"
        subtitle="تعريف فرق العمل لكل جهة. يحدّد مسؤول النظام الدور والصلاحيات من شاشة مستخدمي النظام."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة الفرق" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> فريق جديد
              </Button>
            </DialogTrigger>
            <TeamDialog title="إضافة فريق جديد" orgs={orgs.filter((o) => o.active)} onSave={add} />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="إجمالي الفرق"
          value={stats.total}
          icon={UsersIcon}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          label="فرق بنوك"
          value={stats.bank}
          icon={Building2}
          tone="bg-info/10 text-info"
        />
        <StatCard
          label="فرق اللجنة"
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
            aria-label="بحث في الفرق"
            placeholder="بحث باسم أو معرّف الفريق..."
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-full sm:w-64" aria-label="تصفية الفرق حسب الجهة">
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
            {teamError(ctrl.error, "تعذّر تحميل الفرق")}
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
                    الفريق
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
                {list.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {t.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        {orgIcon(ctrl.orgCategory(t.orgKind))}
                        <span>{ctrl.orgLabel(t.orgKind)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {ctrl.apiEnabled ? "—" : DEMO_USERS.filter((u) => u.teamId === t.id).length}
                    </td>
                    <td className="px-4 py-3">
                      {t.builtin ? (
                        <Badge className="bg-info/15 text-info border-0">افتراضي</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-0">مخصّص</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.active ? (
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
                          onClick={() => setEditing(t)}
                          disabled={ctrl.busy}
                        >
                          <Edit className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={t.active ? "text-destructive" : "text-success"}
                          onClick={() => toggleActive(t)}
                          disabled={ctrl.busy}
                        >
                          <Power className="h-3.5 w-3.5 ml-1" />
                          {t.active ? "إلغاء تفعيل" : "تفعيل"}
                        </Button>
                        {!t.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => remove(t)}
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
                      {teams.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                            <UsersIcon className="h-5 w-5" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            لا توجد فرق بعد. أضف أول فريق لتجميع مستخدمي الجهة وتنظيم عملهم.
                          </p>
                          <Button size="sm" onClick={() => setOpenAdd(true)}>
                            <Plus className="h-4 w-4 ml-1" /> فريق جديد
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          لا توجد فرق مطابقة لبحثك.
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
          <TeamDialog
            title="تعديل الفريق"
            initial={editing}
            orgs={orgs.filter((o) => o.active)}
            onSave={(p) => update(editing, p)}
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
      <div className={cn("h-9 w-9 rounded-lg grid place-items-center", tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function TeamDialog({
  title,
  initial,
  orgs,
  onSave,
}: {
  title: string;
  initial?: TeamRecord;
  orgs: { id: string; label: string }[];
  onSave: (p: Payload) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [orgKind, setOrgKind] = useState<TeamOrgKind>(initial?.orgKind ?? orgs[0]?.id ?? "");
  const valid = label.trim().length > 0 && !!orgKind;

  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          يُستخدم الفريق لتجميع المستخدمين داخل الجهة. الدور يختاره مسؤول النظام عند إضافة كل
          مستخدم.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم الفريق *</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="مثلاً: فريق المتابعة"
          />
        </div>
        <div className="space-y-1.5">
          <Label>الجهة *</Label>
          <Select value={orgKind} onValueChange={setOrgKind}>
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
        <Button disabled={!valid} onClick={() => valid && onSave({ label: label.trim(), orgKind })}>
          {initial ? "حفظ التعديلات" : "إضافة الفريق"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
