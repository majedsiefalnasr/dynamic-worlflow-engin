import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Edit,
  Power,
  Search,
  Trash2,
  Building2,
  Network,
  Landmark,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  getOrgCategory,
  teamsCell,
  roleCatalogCell,
  type OrgCategory,
  type OrgRecord,
} from "@/lib/governance";
import { useOrganizations, useOrgMutations } from "@/lib/data/organizations";
import { isDomainError } from "@/lib/data/errors";
import { useAuth } from "@/lib/mock";
import { useUsers } from "@/lib/data/users";
import { RoleGuard } from "@/components/workflow/RoleGuard";

export const Route = createFileRoute("/admin/orgs")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]}>
      <OrgsAdmin />
    </RoleGuard>
  ),
});

type Payload = { label: string; category: OrgCategory };

function operationErrorMessage(e: unknown): string {
  if (isDomainError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return "فشلت العملية.";
}

const ORG_CATEGORIES: {
  value: OrgCategory;
  label: string;
  description: string;
  icon: typeof Building2;
}[] = [
  { value: "bank", label: "بنوك", description: "البنوك التجارية وشركات الصرافة.", icon: Building2 },
  {
    value: "committee",
    label: "اللجنة الوطنية",
    description: "الجهات التابعة للجنة الوطنية لتمويل الواردات.",
    icon: Landmark,
  },
  {
    value: "other",
    label: "أخرى",
    description: "الإدارات والجهات التي لا تنتمي للتصنيفين السابقين.",
    icon: Network,
  },
];

function OrgsAdmin() {
  const { user } = useAuth();
  const { data: orgs, isLoading } = useOrganizations();
  const { data: userList } = useUsers();
  const teams = teamsCell.use();
  const roles = roleCatalogCell.use();
  const mutations = useOrgMutations(
    user ? { userId: String(user.id), userName: user.name, role: user.roleId } : undefined,
  );
  const [q, setQ] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<OrgRecord | null>(null);

  const list = useMemo(() => {
    if (!orgs) return [];
    const s = q.trim().toLowerCase();
    return orgs.filter(
      (o) => !s || o.label.toLowerCase().includes(s) || o.code.toLowerCase().includes(s),
    );
  }, [orgs, q]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function add(p: Payload) {
    try {
      await mutations.createOrg.mutate({ name: p.label, metadata: { category: p.category } });
      toast.success(`تمت إضافة الجهة "${p.label}"`);
      setOpenAdd(false);
    } catch (e) {
      toast.error(operationErrorMessage(e));
    }
  }

  async function update(target: OrgRecord, p: Payload) {
    try {
      await mutations.updateOrg.mutate({
        id: target.id,
        name: p.label,
        metadata: { category: p.category },
        version: target._version,
      });
      toast.success("تم حفظ التعديلات");
      setEditing(null);
    } catch (e) {
      toast.error(operationErrorMessage(e));
    }
  }

  async function toggle(o: OrgRecord) {
    try {
      await mutations.toggleOrg.mutate({ id: o.id, activate: !o.active });
      toast.success(o.active ? `تم إلغاء تفعيل "${o.label}"` : `تم تفعيل "${o.label}"`);
    } catch (e) {
      toast.error(operationErrorMessage(e));
    }
  }

  async function remove(o: OrgRecord) {
    if (o.builtin) return toast.error("لا يمكن حذف جهة افتراضية.");
    const usedByTeams = teams.filter((t) => t.orgCode === o.code).length;
    const usedByRoles = roles.filter((r) => r.orgCode === o.code).length;
    if (usedByTeams || usedByRoles) {
      return toast.error(`لا يمكن الحذف، الجهة مرتبطة بـ ${usedByTeams} فريق و${usedByRoles} دور.`);
    }
    try {
      await mutations.deleteOrg.mutate({ id: o.id });
      toast.success(`تم حذف "${o.label}"`);
    } catch (e) {
      toast.error(operationErrorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="إدارة الجهات"
        subtitle="تعريف الجهات المستفيدة من النظام، مثل البنوك واللجان والإدارات. تُستخدم لتصنيف الفرق والأدوار والمستخدمين."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "إدارة الجهات" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> جهة جديدة
              </Button>
            </DialogTrigger>
            <OrgDialog title="إضافة جهة جديدة" onSave={add} />
          </Dialog>
        }
      />

      <Card className="p-4 mb-4 shadow-card border-0">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-10"
            aria-label="بحث في الجهات"
            placeholder="بحث باسم أو معرّف الجهة..."
          />
        </div>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="text-right">
                <th scope="col" className="px-4 py-3">
                  الجهة
                </th>
                <th scope="col" className="px-4 py-3">
                  الفرق
                </th>
                <th scope="col" className="px-4 py-3">
                  الأدوار
                </th>
                <th scope="col" className="px-4 py-3">
                  المستخدمون
                </th>
                <th scope="col" className="px-4 py-3">
                  التصنيف
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
              {list.map((o) => {
                const teamCount = teams.filter((t) => t.orgCode === o.code).length;
                const roleCount = roles.filter((r) => r.orgCode === o.code).length;
                const userCount = (userList ?? []).filter(
                  (u) => u.organization?.code === o.code,
                ).length;
                return (
                  <tr key={o.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                          <Network className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{o.label}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {o.code}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">{teamCount}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{roleCount}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{userCount}</td>
                    <td className="px-4 py-3">
                      <OrgCategoryBadge category={getOrgCategory(o)} />
                    </td>
                    <td className="px-4 py-3">
                      {o.builtin ? (
                        <Badge className="bg-info/15 text-info border-0">افتراضي</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-0">مخصّص</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.active ? (
                        <Badge className="bg-success/15 text-success border-0">نشط</Badge>
                      ) : (
                        <Badge className="bg-destructive/15 text-destructive border-0">
                          غير نشط
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
                          <Edit className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={o.active ? "text-destructive" : "text-success"}
                          onClick={() => toggle(o)}
                        >
                          <Power className="h-3.5 w-3.5 ml-1" />
                          {o.active ? "إلغاء تفعيل" : "تفعيل"}
                        </Button>
                        {!o.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => remove(o)}
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
                  <td colSpan={8} className="px-4 py-12 text-center">
                    {(orgs?.length ?? 0) === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                          <Network className="h-5 w-5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          لا توجد جهات بعد. أضف أول جهة لتصنيف الفرق والأدوار والمستخدمين تحتها.
                        </p>
                        <Button size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus className="h-4 w-4 ml-1" /> جهة جديدة
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        لا توجد جهات مطابقة لبحثك.
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
          <OrgDialog title="تعديل الجهة" initial={editing} onSave={(p) => update(editing, p)} />
        )}
      </Dialog>
    </div>
  );
}

function OrgDialog({
  title,
  initial,
  onSave,
}: {
  title: string;
  initial?: OrgRecord;
  onSave: (p: Payload) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState<OrgCategory>(getOrgCategory(initial));
  const valid = label.trim().length > 0;
  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          عرّف اسم الجهة كما سيظهر في القوائم المنسدلة عبر النظام.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>اسم الجهة *</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="مثال: شركات الصرافة"
          />
        </div>
        <div className="space-y-2">
          <Label>تصنيف الجهة *</Label>
          <RadioGroup value={category} onValueChange={(value) => setCategory(value as OrgCategory)}>
            {ORG_CATEGORIES.map((option) => {
              const Icon = option.icon;
              return (
                <Label
                  key={option.value}
                  htmlFor={`org-category-${option.value}`}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem id={`org-category-${option.value}`} value={option.value} />
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block text-xs font-normal leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!valid}
          onClick={() => valid && onSave({ label: label.trim(), category })}
        >
          {initial ? "حفظ التعديلات" : "إضافة الجهة"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function OrgCategoryBadge({ category }: { category: OrgCategory }) {
  const option = ORG_CATEGORIES.find((item) => item.value === category) ?? ORG_CATEGORIES[2];
  const Icon = option.icon;
  return (
    <Badge className="gap-1 border-0 bg-info/15 text-info">
      <Icon className="h-3 w-3" />
      {option.label}
    </Badge>
  );
}
