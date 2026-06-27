import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { teamsCell, orgsCell, getOrgLabel, logAudit, type TeamRecord } from "@/lib/governance";
import { DEMO_USERS, useAuth } from "@/lib/mock";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/teams")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <TeamsAdmin />
    </RoleGuard>
  ),
});

type Payload = {
  label: string;
  orgCode: string;
};

function TeamsAdmin() {
  const { user } = useAuth();
  const teams = teamsCell.use();
  const orgs = orgsCell.use();
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams
      .filter((t) => orgFilter === "all" || t.orgCode === orgFilter)
      .filter((t) => !s || t.label.toLowerCase().includes(s) || t.code.toLowerCase().includes(s));
  }, [teams, q, orgFilter]);

  const stats = useMemo(
    () => ({
      total: teams.length,
      bank: teams.filter((t) => t.orgCode === "bank").length,
      committee: teams.filter((t) => t.orgCode === "committee").length,
      inactive: teams.filter((t) => !t.active).length,
    }),
    [teams],
  );

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
    const code = `team_${Date.now()}`;
    const org = orgs.find((o) => o.code === p.orgCode);
    const t: TeamRecord = {
      id: Date.now(),
      code,
      label: p.label,
      orgId: org?.id ?? 0,
      orgCode: p.orgCode,
      roleCode: "rc_bank_intake",
      active: true,
      builtin: false,
    };
    teamsCell.set((prev) => [...prev, t]);
    audit("إضافة فريق", code, p.label);
    toast.success(`تمت إضافة الفريق "${p.label}"`);
    setOpenAdd(false);
  }

  function update(target: TeamRecord, p: Payload) {
    const org = orgs.find((o) => o.code === p.orgCode);
    teamsCell.set((prev) =>
      prev.map((t) =>
        t.code === target.code
          ? { ...t, label: p.label, orgCode: p.orgCode, orgId: org?.id ?? t.orgId }
          : t,
      ),
    );
    audit("تعديل فريق", target.code, p.label);
    toast.success("تم حفظ التعديلات");
    setEditing(null);
  }

  function toggleActive(t: TeamRecord) {
    const usersInTeam = DEMO_USERS.filter((u) => u.team?.code === t.code).length;
    if (t.active && usersInTeam > 0) {
      toast.info(`تنبيه: ${usersInTeam} مستخدماً مرتبطاً بهذا الفريق`);
    }
    teamsCell.set((prev) => prev.map((x) => (x.code === t.code ? { ...x, active: !x.active } : x)));
    audit(t.active ? "إلغاء تفعيل فريق" : "تفعيل فريق", t.code, t.label);
    toast.success(t.active ? `تم إلغاء تفعيل "${t.label}"` : `تم تفعيل "${t.label}"`);
  }

  function remove(t: TeamRecord) {
    if (t.builtin) return toast.error("لا يمكن حذف فريق افتراضي. يمكنك إلغاء تفعيله بدلاً من ذلك.");
    const usersInTeam = DEMO_USERS.filter((u) => u.team?.code === t.code).length;
    if (usersInTeam > 0)
      return toast.error(`لا يمكن حذف الفريق، يوجد ${usersInTeam} مستخدماً مرتبطاً به.`);
    teamsCell.set((prev) => prev.filter((x) => x.code !== t.code));
    audit("حذف فريق", t.code, t.label);
    toast.success(`تم حذف "${t.label}"`);
  }

  function orgIcon(orgCode: string) {
    if (orgCode === "bank") return <Building2 className="h-3.5 w-3.5 text-info" />;
    if (orgCode === "committee") return <Landmark className="h-3.5 w-3.5 text-accent" />;
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
              {list.map((t) => {
                const count = DEMO_USERS.filter((u) => u.team?.code === t.code).length;
                return (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {t.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        {orgIcon(t.orgCode)}
                        <span>{getOrgLabel(t.orgCode)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">{count}</td>
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
                        <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                          <Edit className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={t.active ? "text-destructive" : "text-success"}
                          onClick={() => toggleActive(t)}
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
  orgs: { id: number; code: string; label: string }[];
  onSave: (p: Payload) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [orgCode, setOrgCode] = useState<string>(initial?.orgCode ?? orgs[0]?.code ?? "bank");
  const valid = label.trim().length > 0 && !!orgCode;

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
        <Button disabled={!valid} onClick={() => valid && onSave({ label: label.trim(), orgCode })}>
          {initial ? "حفظ التعديلات" : "إضافة الفريق"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
