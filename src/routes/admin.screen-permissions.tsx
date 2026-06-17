import { createFileRoute, Link } from "@tanstack/react-router";
import { Info, Check, X, Workflow, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/mock";
import {
  MANAGED_SCREENS, SCREEN_CAP_LABELS,
  screenPermsCell, roleCatalogCell, getOrgLabel,
  manualScreenCan, setScreenPermission, logAudit,
  type ManualScreenKey, type RoleCatalogEntry, type ScreenCapability,
} from "@/lib/governance";
import { requestsAccessForRole } from "@/lib/workflow-bridge";
import { wfStore } from "@/lib/workflow-engine";

export const Route = createFileRoute("/admin/screen-permissions")({
  component: () => (
    <RoleGuard allow={["platform_admin"]} message="صلاحيات ظهور الشاشات متاحة لمسؤول النظام فقط.">
      <ScreenPermissionsAdmin />
    </RoleGuard>
  ),
});

// Short capability labels for the requests group (derived from the designer).
const REQUEST_CAPS: { cap: ScreenCapability; label: string }[] = [
  { cap: "view", label: "عرض" },
  { cap: "add", label: "إنشاء" },
  { cap: "edit", label: "تنفيذ" },
];

// One consolidated matrix: roles are rows (listed once), screens are grouped
// columns. The requests group is derived (read-only icons); the rest are manual
// toggles.
type Group =
  | { key: "requests"; label: string; derived: true; caps: { cap: ScreenCapability; label: string }[] }
  | { key: ManualScreenKey; label: string; derived: false; to: string; caps: { cap: ScreenCapability; label: string }[] };

const GROUPS: Group[] = [
  { key: "requests", label: "الطلبات", derived: true, caps: REQUEST_CAPS },
  ...MANAGED_SCREENS.map((s): Group => ({
    key: s.key,
    label: s.label,
    derived: false,
    to: s.to,
    caps: s.caps.map((cap) => ({ cap, label: SCREEN_CAP_LABELS[cap] })),
  })),
];

function ScreenPermissionsAdmin() {
  const { user } = useAuth();
  screenPermsCell.use();
  const roleCatalog = roleCatalogCell.use();
  wfStore.assignments.use();
  wfStore.versions.use();
  const roleRows = roleCatalog
    .filter((r) => r.active && r.legacyRole !== "platform_admin")
    .sort((a, b) => `${a.orgId}-${a.name}`.localeCompare(`${b.orgId}-${b.name}`));

  function toggle(screen: ManualScreenKey, label: string, role: RoleCatalogEntry, cap: ScreenCapability, enabled: boolean) {
    setScreenPermission(screen, role.legacyRole, cap, enabled);
    if (user) {
      logAudit({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: `${enabled ? "منح" : "إلغاء"} صلاحية ${SCREEN_CAP_LABELS[cap]}`,
        ref: `${screen}:${role.id}`,
        notes: `${label} — ${role.name}`,
      });
    }
  }

  return (
    <div>
      <PageHeader
        title="صلاحيات ظهور الشاشات"
        subtitle="مصفوفة واحدة: كل دور في صف، وكل شاشة في مجموعة أعمدة (عرض / إضافة / تعديل)."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "صلاحيات الشاشات" }]}
        actions={
          <Link to="/admin/workflows">
            <Button variant="outline"><Workflow className="ms-1 h-4 w-4" /> مصمم سير العمل</Button>
          </Link>
        }
      />

      <Card className="p-4 mb-5 shadow-card border-0 flex items-start gap-3 bg-info/5">
        <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          مسؤول النظام يملك كل الصلاحيات تلقائيًا (غير معروض). صلاحيات شاشة <strong>الطلبات</strong> مشتقة
          إلزاميًا من إسنادات المراحل في مصمم سير العمل وتظهر للعرض فقط، بينما باقي الشاشات تُضبط يدويًا
          وتُحفظ تلقائيًا. صفوف المصفوفة تأتي من الأدوار النشطة في شاشة «إدارة الأدوار».
        </div>
      </Card>

      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> مفعّلة (مشتقة)</span>
        <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-muted-foreground/40" /> غير مفعّلة</span>
        <span className="flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> مفتاح قابل للتبديل (يدوي)</span>
      </div>

      <Card className="shadow-card border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40 text-xs">
                <th rowSpan={2} className="px-5 py-3 text-right font-semibold align-bottom sticky inset-s-0 bg-muted/40 z-10 min-w-[180px]">
                  الدور
                </th>
                {GROUPS.map((g) => (
                  <th
                    key={g.key}
                    colSpan={g.caps.length}
                    className="px-4 py-2.5 text-center font-semibold border-s border-border"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-foreground">{g.label}</span>
                      {g.derived ? (
                        <Badge variant="secondary" className="text-[9px] gap-1 font-normal">
                          <Workflow className="h-2.5 w-2.5" /> مشتقة من المصمم
                        </Badge>
                      ) : (
                        <span className="font-mono text-[9px] text-muted-foreground">{g.to}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/20 text-[11px] text-muted-foreground">
                {GROUPS.map((g) =>
                  g.caps.map((c, i) => (
                    <th
                      key={`${g.key}-${c.cap}`}
                      className={`px-4 py-2 text-center font-medium w-24 ${i === 0 ? "border-s border-border" : ""}`}
                    >
                      {c.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {roleRows.map((role) => {
                const reqAccess = requestsAccessForRole(role.legacyRole);
                return (
                  <tr key={role.id} className="border-t hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium sticky inset-s-0 bg-card z-10">
                      <div>{role.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {getOrgLabel(role.orgId)}
                        </Badge>
                        {role.name !== ROLE_LABELS[role.legacyRole] && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {ROLE_LABELS[role.legacyRole]}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {GROUPS.map((g) =>
                      g.caps.map((c, i) => (
                        <td
                          key={`${g.key}-${c.cap}`}
                          className={`px-4 py-3 ${i === 0 ? "border-s border-border" : ""}`}
                        >
                          <div className="flex justify-center">
                            {g.derived ? (
                              reqAccess[c.cap] ? (
                                <Check className="h-4 w-4 text-success" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground/40" />
                              )
                            ) : (
                              <Switch
                                checked={manualScreenCan(role.legacyRole, g.key, c.cap)}
                                onCheckedChange={(v) => toggle(g.key, g.label, role, c.cap, v)}
                              />
                            )}
                          </div>
                        </td>
                      )),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
