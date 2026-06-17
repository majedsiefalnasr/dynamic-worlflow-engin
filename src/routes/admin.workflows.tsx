import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  GitBranch,
  Tag,
  Users2,
  ListChecks,
  Layers,
  RefreshCw,
  FileCog,
  FolderTree,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  wfStore,
  uid,
  cloneVersion,
  publishVersion,
  reseed,
  getEffectiveStageRoutingRules,
  isAssignmentBackedStageRoutingRule,
  type FieldDefinition,
  type WorkflowStage,
  type WorkflowTransition,
  type StageAssignment,
  type FieldRule,
  type WorkflowAction,
  type StageGroup,
  type StageGroupAudience,
  type StageRoutingRule,
  type DynamicSource,
} from "@/lib/workflow-engine";
import { orgsCell, teamsCell, roleCatalogCell, referenceTablesCell } from "@/lib/governance";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/workflows")({
  component: () => (
    <RoleGuard allow={["platform_admin"]} message="مصمم سير العمل متاح لمسؤول النظام فقط.">
      <DesignerPage />
    </RoleGuard>
  ),
});

const ORG_TO_ENGINE_ID: Record<string, string> = {
  bank: "org_bank",
  committee: "org_committee",
  platform: "org_committee",
};

const ROLE_TO_ENGINE_ID: Record<string, string> = {
  rc_bank_admin: "role_reviewer",
  rc_bank_intake: "role_entry",
  rc_bank_reviewer: "role_reviewer",
  rc_bank_swift: "role_fx",
  rc_support_member: "role_support",
  rc_executive_member: "role_exec_member",
  rc_committee_manager: "role_exec_lead",
  rc_platform_admin: "role_admin",
};

const toEngineOrgId = (id: string | undefined) => (id ? (ORG_TO_ENGINE_ID[id] ?? id) : undefined);
const toEngineRoleId = (id: string | undefined) => (id ? (ROLE_TO_ENGINE_ID[id] ?? id) : undefined);

const FIELD_TYPES: { value: FieldDefinition["type"]; label: string }[] = [
  { value: "text", label: "نص" },
  { value: "number", label: "رقم" },
  { value: "date", label: "تاريخ" },
  { value: "select", label: "قائمة (خيارات يدوية)" },
  { value: "dynamic_select", label: "قائمة ديناميكية (من جدول)" },
  { value: "textarea", label: "نص طويل" },
  { value: "file", label: "ملف" },
  { value: "currency", label: "عملة" },
  { value: "checkbox", label: "اختيار" },
];

const DYNAMIC_SOURCES: { value: DynamicSource; label: string }[] = [
  { value: "merchants", label: "التجار" },
  { value: "merchant_companies", label: "شركات التاجر المرتبطة" },
];

const fieldTypeLabel = (t: FieldDefinition["type"]) =>
  FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
const sourceLabel = (s: DynamicSource | undefined) =>
  DYNAMIC_SOURCES.find((x) => x.value === s)?.label ?? "—";
type DynamicSourceOption = DynamicSource | `reference:${string}`;
const referenceSourceValue = (key: string): DynamicSourceOption => `reference:${key}`;
const isReferenceSourceValue = (value: DynamicSourceOption): value is `reference:${string}` =>
  value.startsWith("reference:");
const referenceKeyFromSourceValue = (value: DynamicSourceOption) =>
  value.slice("reference:".length);

function DesignerPage() {
  const defs = wfStore.definitions.use();
  const versions = wfStore.versions.use();
  const [defId, setDefId] = useState<string>(defs[0]?.id ?? "");
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const defVersions = versions.filter((v) => v.workflowId === def?.id);
  const [verId, setVerId] = useState<string>(def?.activeVersionId ?? defVersions[0]?.id ?? "");

  // ensure verId stays valid when def changes
  if (def && !defVersions.find((v) => v.id === verId)) {
    const fallback = def.activeVersionId ?? defVersions[0]?.id ?? "";
    if (fallback && fallback !== verId) setVerId(fallback);
  }

  const onClone = () => {
    if (!verId) return;
    const newVer = cloneVersion(
      verId,
      `${defVersions.find((v) => v.id === verId)?.version ?? "1.0"}.${Date.now().toString().slice(-3)}`,
    );
    if (newVer) {
      toast.success(`تم إنشاء نسخة جديدة ${newVer.version}`);
      setVerId(newVer.id);
    }
  };

  const onPublish = () => {
    if (!verId) return;
    publishVersion(verId);
    toast.success("تم نشر النسخة");
  };

  const onReseed = () => {
    if (confirm("سيتم استبدال كل تكوين المحرّك بالبيانات الافتراضية. متابعة؟")) {
      reseed();
      toast.success("تم إعادة بناء البيانات");
      const first = wfStore.definitions.get()[0];
      if (first) {
        setDefId(first.id);
        setVerId(first.activeVersionId ?? "");
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="مصمم سير العمل"
        subtitle="إعداد المراحل، الانتقالات، الصلاحيات، الحقول، وقواعد الرؤية — بدون كود."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "مصمم سير العمل" }]}
        actions={
          <Button variant="outline" onClick={onReseed}>
            <RefreshCw className="ms-1 h-4 w-4" /> إعادة البناء
          </Button>
        }
      />

      {/* Workflow + Version picker */}
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">سير العمل</Label>
            <Select value={defId} onValueChange={setDefId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر..." />
              </SelectTrigger>
              <SelectContent>
                {defs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">النسخة</Label>
            <Select value={verId} onValueChange={setVerId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر نسخة..." />
              </SelectTrigger>
              <SelectContent>
                {defVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.version} {v.isPublished ? "(منشورة)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={onClone}>
              <Plus className="ms-1 h-4 w-4" /> نسخة جديدة
            </Button>
            <Button onClick={onPublish}>
              <Tag className="ms-1 h-4 w-4" /> نشر
            </Button>
          </div>
        </div>
      </Card>

      {!verId ? (
        <Card className="p-10 text-center text-muted-foreground">لا توجد نسخة محدّدة.</Card>
      ) : (
        <Tabs defaultValue="stages">
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="stages">
              <Layers className="ms-1 h-4 w-4" /> المراحل
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-44 sm:flex-none" value="stageRouting">
              <Users2 className="ms-1 h-4 w-4" /> سير العملية التنظيمية
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="transitions">
              <GitBranch className="ms-1 h-4 w-4" /> الانتقالات
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="assignments">
              <Users2 className="ms-1 h-4 w-4" /> الصلاحيات
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="fields">
              <FileCog className="ms-1 h-4 w-4" /> الحقول
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="rules">
              <ListChecks className="ms-1 h-4 w-4" /> قواعد الحقول
            </TabsTrigger>
            <TabsTrigger className="min-h-10 flex-1 basis-36 sm:flex-none" value="actions">
              <Tag className="ms-1 h-4 w-4" /> الإجراءات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stages">
            <StagesTab versionId={verId} />
          </TabsContent>
          <TabsContent value="stageRouting">
            <StageRoutingTab versionId={verId} />
          </TabsContent>
          <TabsContent value="transitions">
            <TransitionsTab versionId={verId} />
          </TabsContent>
          <TabsContent value="assignments">
            <AssignmentsTab versionId={verId} />
          </TabsContent>
          <TabsContent value="fields">
            <FieldsTab versionId={verId} />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab versionId={verId} />
          </TabsContent>
          <TabsContent value="actions">
            <ActionsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============================================================
// Stages
// ============================================================
function StagesTab({ versionId }: { versionId: string }) {
  const stages = wfStore.stages
    .use()
    .filter((s) => s.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const add = () => {
    if (!name || !code) return toast.error("الاسم والرمز مطلوبان");
    const max = stages.reduce((m, s) => Math.max(m, s.order), 0);
    const s: WorkflowStage = {
      id: uid("s"),
      workflowVersionId: versionId,
      code,
      name,
      order: max + 1,
    };
    wfStore.stages.update((arr) => [...arr, s]);
    setName("");
    setCode("");
  };
  const remove = (id: string) => {
    wfStore.stages.update((arr) => arr.filter((s) => s.id !== id));
    wfStore.transitions.update((arr) =>
      arr.filter((t) => t.fromStageId !== id && t.toStageId !== id),
    );
    wfStore.assignments.update((arr) => arr.filter((a) => a.stageId !== id));
    wfStore.stageRoutingRules.update((arr) => arr.filter((r) => r.stageId !== id));
    wfStore.fieldRules.update((arr) => arr.filter((r) => r.stageId !== id));
  };
  const toggleFlag = (id: string, key: "isInitial" | "isFinal") => {
    wfStore.stages.update((arr) => arr.map((s) => (s.id === id ? { ...s, [key]: !s[key] } : s)));
  };
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Input
            placeholder="رمز المرحلة (مثال: REVIEW)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input placeholder="اسم المرحلة" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={add}>
            <Plus className="ms-1 h-4 w-4" /> إضافة مرحلة
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الترتيب</TableHead>
              <TableHead>الرمز</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>بداية</TableHead>
              <TableHead>نهاية</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.order}</TableCell>
                <TableCell className="font-mono text-xs">{s.code}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <Switch
                    checked={!!s.isInitial}
                    onCheckedChange={() => toggleFlag(s.id, "isInitial")}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={!!s.isFinal}
                    onCheckedChange={() => toggleFlag(s.id, "isFinal")}
                  />
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ============================================================
// Stage routing (organizational process + request visibility)
// ============================================================
function StageRoutingTab({ versionId }: { versionId: string }) {
  const stages = wfStore.stages
    .use()
    .filter((s) => s.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
  const manualRules = wfStore.stageRoutingRules.use();
  const assignments = wfStore.assignments.use();
  const rules = useMemo(
    () => getEffectiveStageRoutingRules(versionId),
    [versionId, manualRules, assignments, stages],
  );
  const orgs = orgsCell.use().filter((o) => o.active);
  const teamsAll = teamsCell.use().filter((t) => t.active);
  const rolesAll = roleCatalogCell.use().filter((r) => r.active);
  const wfOrgs = wfStore.orgs.use();
  const wfRoles = wfStore.roles.use();

  const orgLabel = (id?: string) =>
    orgs.find((x) => x.id === id)?.label ?? wfOrgs.find((x) => x.id === id)?.name ?? id ?? "—";
  const teamLabel = (id?: string) => teamsAll.find((x) => x.id === id)?.label ?? id ?? "—";
  const roleLabel = (id?: string) =>
    rolesAll.find((x) => x.id === id)?.name ?? wfRoles.find((x) => x.id === id)?.name ?? id ?? "—";
  const remove = (id: string) => {
    if (isAssignmentBackedStageRoutingRule(id)) {
      return toast.error("هذه القاعدة إلزامية لأنها مشتقة من صلاحيات المرحلة");
    }
    wfStore.stageRoutingRules.update((arr) => arr.filter((r) => r.id !== id));
  };

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="font-semibold">سير العملية التنظيمية</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          قواعد الصلاحيات تظهر تلقائيا هنا ولا يمكن حذفها من هذا التبويب. يمكنك إضافة قواعد تنظيمية
          إضافية وحذفها عند الحاجة.
        </p>
      </div>
      <div className="space-y-5">
        {stages.map((stage) => (
          <StageRoutingSection
            key={stage.id}
            stage={stage}
            rules={rules.filter((r) => r.stageId === stage.id)}
            orgs={orgs}
            teamsAll={teamsAll}
            rolesAll={rolesAll}
            labels={{ orgLabel, teamLabel, roleLabel }}
            onRemove={remove}
          />
        ))}
      </div>
    </Card>
  );
}

function StageRoutingSection({
  stage,
  rules,
  orgs,
  teamsAll,
  rolesAll,
  labels,
  onRemove,
}: {
  stage: WorkflowStage;
  rules: StageRoutingRule[];
  orgs: ReturnType<typeof orgsCell.get>;
  teamsAll: ReturnType<typeof teamsCell.get>;
  rolesAll: ReturnType<typeof roleCatalogCell.get>;
  labels: {
    orgLabel: (id?: string) => string;
    teamLabel: (id?: string) => string;
    roleLabel: (id?: string) => string;
  };
  onRemove: (id: string) => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [processLabel, setProcessLabel] = useState(stage.name);
  const NONE = "__none__";
  const teams = orgId && orgId !== NONE ? teamsAll.filter((t) => t.orgKind === orgId) : teamsAll;
  const roles = orgId && orgId !== NONE ? rolesAll.filter((r) => r.orgId === orgId) : rolesAll;

  const add = () => {
    if (!processLabel.trim()) return toast.error("المسمى مطلوب");
    const rule: StageRoutingRule = {
      id: uid("sr"),
      workflowVersionId: stage.workflowVersionId,
      stageId: stage.id,
      organizationId: orgId && orgId !== NONE ? orgId : undefined,
      teamId: teamId && teamId !== NONE ? teamId : undefined,
      roleId: roleId && roleId !== NONE ? roleId : undefined,
      processLabel: processLabel.trim(),
    };
    if (!rule.organizationId && !rule.teamId && !rule.roleId) {
      return toast.error("حدّد على الأقل جهة أو فريق أو دور");
    }
    wfStore.stageRoutingRules.update((arr) => [...arr, rule]);
    setOrgId("");
    setTeamId("");
    setRoleId("");
    setProcessLabel(stage.name);
  };

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">{stage.name}</div>
          <div className="text-[11px] font-mono text-muted-foreground">{stage.code}</div>
        </div>
        <Badge variant="secondary">{rules.length} قاعدة</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <Select
          value={orgId}
          onValueChange={(v) => {
            setOrgId(v);
            setTeamId("");
            setRoleId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="الجهة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger>
            <SelectValue placeholder="الفريق" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger>
            <SelectValue placeholder="الدور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={processLabel}
          onChange={(e) => setProcessLabel(e.target.value)}
          placeholder="المسمى المعروض"
        />
        <Button onClick={add}>
          <Plus className="ms-1 h-4 w-4" /> إضافة
        </Button>
      </div>
      <Table className="mt-3">
        <TableHeader>
          <TableRow>
            <TableHead>الجهة</TableHead>
            <TableHead>الفريق</TableHead>
            <TableHead>الدور</TableHead>
            <TableHead>المسمى</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{labels.orgLabel(r.organizationId)}</TableCell>
              <TableCell>{labels.teamLabel(r.teamId)}</TableCell>
              <TableCell>{labels.roleLabel(r.roleId)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{r.processLabel}</span>
                  {isAssignmentBackedStageRoutingRule(r.id) && (
                    <Badge variant="outline">من الصلاحيات</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {!isAssignmentBackedStageRoutingRule(r.id) && (
                  <Button size="icon" variant="ghost" onClick={() => onRemove(r.id)} title="حذف">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rules.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                لا توجد قواعد لهذه المرحلة.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================
// Stage Groups (legacy, no longer shown in the designer)
// ============================================================
function StageGroupsManager({ versionId }: { versionId: string }) {
  const groups = wfStore.stageGroups
    .use()
    .filter((g) => g.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
  const stages = wfStore.stages.use().filter((s) => s.workflowVersionId === versionId);
  const orgs = orgsCell.use();
  const teams = teamsCell.use();
  const roles = roleCatalogCell.use();
  const [groupName, setGroupName] = useState("");
  const [editing, setEditing] = useState<StageGroup | null>(null);

  const addGroup = () => {
    if (!groupName.trim()) return toast.error("اسم المجموعة مطلوب");
    const max = groups.reduce((m, g) => Math.max(m, g.order), 0);
    wfStore.stageGroups.update((arr) => [
      ...arr,
      {
        id: uid("sg"),
        workflowVersionId: versionId,
        name: groupName.trim(),
        order: max + 1,
      },
    ]);
    setGroupName("");
    toast.success("تمت إضافة المجموعة");
  };
  const removeGroup = (id: string) => {
    wfStore.stageGroups.update((arr) => arr.filter((g) => g.id !== id));
    wfStore.stages.update((arr) =>
      arr.map((s) => (s.groupId === id ? { ...s, groupId: undefined } : s)),
    );
    toast.success("تم حذف المجموعة");
  };
  const moveGroup = (id: string, dir: -1 | 1) => {
    const idx = groups.findIndex((g) => g.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= groups.length) return;
    const a = groups[idx],
      b = groups[swap];
    wfStore.stageGroups.update((arr) =>
      arr.map((g) =>
        g.id === a.id ? { ...g, order: b.order } : g.id === b.id ? { ...g, order: a.order } : g,
      ),
    );
  };

  const orgLabel = (id?: string) => orgs.find((x) => x.id === id)?.label ?? id ?? "";
  const teamLabel = (id?: string) => teams.find((x) => x.id === id)?.label ?? id ?? "";
  const roleLabel = (id?: string) => roles.find((x) => x.id === id)?.name ?? id ?? "";

  const ruleLabel = (r: StageGroupAudience) => {
    const parts = [
      r.organizationId ? orgLabel(r.organizationId) : "أي جهة",
      r.teamId ? teamLabel(r.teamId) : "أي فريق",
      r.roleId ? roleLabel(r.roleId) : "أي دور",
    ];
    return parts.join(" › ");
  };
  const audienceSummary = (g: StageGroup) => {
    const rules = g.audiences ?? [];
    if (!rules.length) return "ظاهرة للجميع";
    return rules.map(ruleLabel).join("  •  ");
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <FolderTree className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">مجموعات المراحل (سير العملية التنظيمية)</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        تُجمَّع المراحل في مجموعات تظهر في «سير العملية التنظيمية» بشاشة الطلب. حدّد
        الجهات/الفرق/الأدوار التي تظهر لها كل مجموعة — والمجموعة بدون تحديد تظهر للجميع.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Input
          placeholder="اسم المجموعة (مثال: إجراءات البنك)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="md:col-span-3"
        />
        <Button onClick={addGroup}>
          <Plus className="ms-1 h-4 w-4" /> إضافة مجموعة
        </Button>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مجموعات بعد.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={g.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Badge variant="secondary" className="font-mono text-[10px]">
                {i + 1}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{g.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {audienceSummary(g)}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {stages.filter((s) => s.groupId === g.id).length} مرحلة
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => moveGroup(g.id, -1)}
                disabled={i === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => moveGroup(g.id, 1)}
                disabled={i === groups.length - 1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(g)}>
                <Users2 className="ms-1 h-3.5 w-3.5" /> الجمهور
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeGroup(g.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && <AudienceDialog group={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

const AUD_ANY = "__any__";

function AudienceDialog({ group, onClose }: { group: StageGroup; onClose: () => void }) {
  const orgs = orgsCell.use().filter((o) => o.active);
  const teams = teamsCell.use().filter((t) => t.active);
  const roles = roleCatalogCell.use().filter((r) => r.active);
  const [rows, setRows] = useState<StageGroupAudience[]>(group.audiences ?? []);

  // Cascading draft: org → team → role (each may be "any").
  const [orgId, setOrgId] = useState(AUD_ANY);
  const [teamId, setTeamId] = useState(AUD_ANY);
  const [roleId, setRoleId] = useState(AUD_ANY);

  const teamsForOrg = orgId !== AUD_ANY ? teams.filter((t) => t.orgKind === orgId) : teams;
  const rolesForOrg = orgId !== AUD_ANY ? roles.filter((r) => r.orgId === orgId) : roles;

  const orgLabel = (id?: string) => orgs.find((x) => x.id === id)?.label ?? id ?? "";
  const teamLabel = (id?: string) => teams.find((x) => x.id === id)?.label ?? id ?? "";
  const roleLabel = (id?: string) => roles.find((x) => x.id === id)?.name ?? id ?? "";

  const addRow = () => {
    if (orgId === AUD_ANY && teamId === AUD_ANY && roleId === AUD_ANY) {
      return toast.error("حدّد على الأقل جهة أو فريق أو دور");
    }
    const rule: StageGroupAudience = {
      organizationId: orgId === AUD_ANY ? undefined : orgId,
      teamId: teamId === AUD_ANY ? undefined : teamId,
      roleId: roleId === AUD_ANY ? undefined : roleId,
    };
    setRows((prev) => [...prev, rule]);
    setOrgId(AUD_ANY);
    setTeamId(AUD_ANY);
    setRoleId(AUD_ANY);
  };
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const save = () => {
    wfStore.stageGroups.update((arr) =>
      arr.map((g) =>
        g.id === group.id
          ? {
              ...g,
              audiences: rows.length ? rows : undefined,
            }
          : g,
      ),
    );
    toast.success("تم حفظ جمهور المجموعة");
    onClose();
  };

  return (
    <DialogContent dir="rtl" className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>جمهور المجموعة: {group.name}</DialogTitle>
        <DialogDescription>
          أضف صفوف الجمهور بنفس فكرة الصلاحيات: الجهة ← الفريق ← الدور (مع خيار «أي» للكل). يرى
          المستخدم المجموعة إذا طابق أي صف. بدون صفوف تظهر للجميع.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end py-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">الجهة</Label>
          <Select
            value={orgId}
            onValueChange={(v) => {
              setOrgId(v);
              setTeamId(AUD_ANY);
              setRoleId(AUD_ANY);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUD_ANY}>أي جهة</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">الفريق</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUD_ANY}>أي فريق</SelectItem>
              {teamsForOrg.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">الدور</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUD_ANY}>أي دور</SelectItem>
              {rolesForOrg.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addRow}>
          <Plus className="ms-1 h-4 w-4" /> إضافة صف
        </Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
            لا توجد صفوف — المجموعة ظاهرة للجميع.
          </p>
        ) : (
          rows.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Badge variant="secondary" className="font-mono text-[10px]">
                {idx + 1}
              </Badge>
              <span className="flex-1 text-sm">
                {r.organizationId ? orgLabel(r.organizationId) : "أي جهة"}
                <span className="text-muted-foreground"> › </span>
                {r.teamId ? teamLabel(r.teamId) : "أي فريق"}
                <span className="text-muted-foreground"> › </span>
                {r.roleId ? roleLabel(r.roleId) : "أي دور"}
              </span>
              <Button size="icon" variant="ghost" onClick={() => removeRow(idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      <DialogFooter>
        <Button onClick={save}>حفظ</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// Transitions
// ============================================================
function TransitionsTab({ versionId }: { versionId: string }) {
  const stages = wfStore.stages.use().filter((s) => s.workflowVersionId === versionId);
  const actions = wfStore.actions.use();
  const transitions = wfStore.transitions.use().filter((t) => t.workflowVersionId === versionId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actCode, setActCode] = useState("");

  const add = () => {
    if (!from || !to || !actCode) return toast.error("يجب اختيار: من، إلى، الإجراء");
    const action = actions.find((a) => a.code === actCode);
    const t: WorkflowTransition = {
      id: uid("t"),
      workflowVersionId: versionId,
      fromStageId: from,
      toStageId: to,
      actionCode: actCode,
      actionName: action?.name ?? actCode,
    };
    wfStore.transitions.update((arr) => [...arr, t]);
    setFrom("");
    setTo("");
    setActCode("");
  };
  const remove = (id: string) =>
    wfStore.transitions.update((arr) => arr.filter((t) => t.id !== id));
  const sName = (id: string) => stages.find((s) => s.id === id)?.name ?? id;

  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger>
            <SelectValue placeholder="من مرحلة..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actCode} onValueChange={setActCode}>
          <SelectTrigger>
            <SelectValue placeholder="عند الإجراء..." />
          </SelectTrigger>
          <SelectContent>
            {actions.map((a) => (
              <SelectItem key={a.code} value={a.code}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger>
            <SelectValue placeholder="إلى مرحلة..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add}>
          <Plus className="ms-1 h-4 w-4" /> إضافة
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>من</TableHead>
            <TableHead>الإجراء</TableHead>
            <TableHead>إلى</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transitions.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{sName(t.fromStageId)}</TableCell>
              <TableCell>
                <Badge variant="outline">{t.actionName}</Badge>
              </TableCell>
              <TableCell>{sName(t.toStageId)}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ============================================================
// Assignments
// ============================================================
function AssignmentsTab({ versionId }: { versionId: string }) {
  const stages = wfStore.stages.use().filter((s) => s.workflowVersionId === versionId);
  const orgs = orgsCell.use().filter((o) => o.active);
  const teamsAll = teamsCell.use().filter((t) => t.active);
  const rolesAll = roleCatalogCell.use().filter((r) => r.active);
  const users = wfStore.users.use();
  const wfOrgs = wfStore.orgs.use();
  const wfRoles = wfStore.roles.use();
  const assigns = wfStore.assignments.use().filter((a) => stages.some((s) => s.id === a.stageId));

  const [stageId, setStageId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [userId, setUserId] = useState("");
  const [viewOnly, setViewOnly] = useState(false);

  // Cascade: teams/roles filter by selected org
  const teams =
    orgId && orgId !== "__none__" ? teamsAll.filter((t) => t.orgKind === orgId) : teamsAll;
  const roles =
    orgId && orgId !== "__none__" ? rolesAll.filter((r) => r.orgId === orgId) : rolesAll;

  const NONE = "__none__";
  const add = () => {
    if (!stageId) return toast.error("اختر مرحلة");
    const a: StageAssignment = {
      id: uid("a"),
      stageId,
      organizationId: orgId && orgId !== NONE ? toEngineOrgId(orgId) : undefined,
      teamId: teamId && teamId !== NONE ? teamId : undefined,
      roleId: roleId && roleId !== NONE ? toEngineRoleId(roleId) : undefined,
      userId: userId && userId !== NONE ? userId : undefined,
      viewOnly,
    };
    if (!a.organizationId && !a.teamId && !a.roleId && !a.userId) {
      return toast.error("حدّد على الأقل جهة/فريق/دور/مستخدم");
    }
    wfStore.assignments.update((arr) => [...arr, a]);
    setOrgId("");
    setTeamId("");
    setRoleId("");
    setUserId("");
    setViewOnly(false);
  };
  const remove = (id: string) =>
    wfStore.assignments.update((arr) => arr.filter((x) => x.id !== id));

  const orgLabel = (id?: string) =>
    orgs.find((o) => o.id === id)?.label ?? wfOrgs.find((o) => o.id === id)?.name ?? "—";
  const teamLabel = (id?: string) => teamsAll.find((t) => t.id === id)?.label ?? "—";
  const roleLabel = (id?: string) =>
    rolesAll.find((r) => r.id === id)?.name ?? wfRoles.find((r) => r.id === id)?.name ?? "—";

  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4 items-end">
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger>
            <SelectValue placeholder="المرحلة..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={orgId}
          onValueChange={(v) => {
            setOrgId(v);
            setTeamId("");
            setRoleId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="الجهة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger>
            <SelectValue placeholder="الفريق" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger>
            <SelectValue placeholder="الدور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue placeholder="مستخدم محدّد" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— أي —</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch checked={viewOnly} onCheckedChange={setViewOnly} />
          <Label>عرض فقط</Label>
        </div>
        <Button onClick={add}>
          <Plus className="ms-1 h-4 w-4" /> إضافة
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>المرحلة</TableHead>
            <TableHead>الجهة</TableHead>
            <TableHead>الفريق</TableHead>
            <TableHead>الدور</TableHead>
            <TableHead>المستخدم</TableHead>
            <TableHead>النوع</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assigns.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{stages.find((s) => s.id === a.stageId)?.name}</TableCell>
              <TableCell>{orgLabel(a.organizationId)}</TableCell>
              <TableCell>{teamLabel(a.teamId)}</TableCell>
              <TableCell>{roleLabel(a.roleId)}</TableCell>
              <TableCell>{users.find((u) => u.id === a.userId)?.fullName ?? "—"}</TableCell>
              <TableCell>
                {a.viewOnly ? <Badge variant="outline">عرض</Badge> : <Badge>تنفيذ</Badge>}
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ============================================================
// Fields
// ============================================================
const NO_GROUP = "__none";

function FieldsTab({ versionId }: { versionId: string }) {
  const fields = wfStore.fieldDefs.use().filter((f) => f.workflowVersionId === versionId);
  const groups = wfStore.fieldGroups
    .use()
    .filter((g) => g.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
  const referenceTables = referenceTablesCell.use();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [options, setOptions] = useState("");
  const [sourceValue, setSourceValue] = useState<DynamicSourceOption>("merchants");
  const [groupId, setGroupId] = useState<string>(NO_GROUP);
  const [groupName, setGroupName] = useState("");
  const dynamicSourceOptions = useMemo(
    () => [
      ...DYNAMIC_SOURCES,
      ...referenceTables.map((t) => ({
        value: referenceSourceValue(t.key),
        label: t.label,
      })),
    ],
    [referenceTables],
  );

  const add = () => {
    if (!key || !label) return toast.error("الرمز والوصف مطلوبان");
    const dynamicSource =
      type === "dynamic_select"
        ? isReferenceSourceValue(sourceValue)
          ? "reference_data"
          : sourceValue
        : undefined;
    const dynamicReferenceKey =
      type === "dynamic_select" && isReferenceSourceValue(sourceValue)
        ? referenceKeyFromSourceValue(sourceValue)
        : undefined;
    const f: FieldDefinition = {
      id: uid("fd"),
      workflowVersionId: versionId,
      key,
      label,
      type,
      options:
        type === "select"
          ? options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
      referenceTableKey: dynamicReferenceKey,
      sourceTable: dynamicSource,
      groupId: groupId === NO_GROUP ? undefined : groupId,
    };
    wfStore.fieldDefs.update((arr) => [...arr, f]);
    setKey("");
    setLabel("");
    setOptions("");
    setSourceValue("merchants");
  };
  const remove = (id: string) => {
    const f = fields.find((x) => x.id === id);
    if (!f) return;
    if (f.system) return toast.error("لا يمكن حذف حقل افتراضي من النظام");
    wfStore.fieldDefs.update((arr) => arr.filter((x) => x.id !== id));
    wfStore.fieldRules.update((arr) => arr.filter((r) => r.fieldKey !== f.key));
  };
  const setFieldGroup = (id: string, gid: string) => {
    wfStore.fieldDefs.update((arr) =>
      arr.map((x) => (x.id === id ? { ...x, groupId: gid === NO_GROUP ? undefined : gid } : x)),
    );
  };

  const addGroup = () => {
    if (!groupName.trim()) return toast.error("اسم المجموعة مطلوب");
    const max = groups.reduce((m, g) => Math.max(m, g.order), 0);
    wfStore.fieldGroups.update((arr) => [
      ...arr,
      {
        id: uid("fg"),
        workflowVersionId: versionId,
        name: groupName.trim(),
        order: max + 1,
      },
    ]);
    setGroupName("");
    toast.success("تمت إضافة المجموعة");
  };
  const removeGroup = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (group?.system) return toast.error("لا يمكن حذف مجموعة حقول افتراضية من النظام");
    wfStore.fieldGroups.update((arr) => arr.filter((g) => g.id !== id));
    wfStore.fieldDefs.update((arr) =>
      arr.map((f) => (f.groupId === id ? { ...f, groupId: undefined } : f)),
    );
    toast.success('تم حذف المجموعة (نُقلت حقولها إلى "عام")');
  };
  const moveGroup = (id: string, dir: -1 | 1) => {
    const idx = groups.findIndex((g) => g.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= groups.length) return;
    const a = groups[idx],
      b = groups[swap];
    wfStore.fieldGroups.update((arr) =>
      arr.map((g) =>
        g.id === a.id ? { ...g, order: b.order } : g.id === b.id ? { ...g, order: a.order } : g,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Groups manager */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">مجموعات الحقول (تبويبات شاشة الطلب)</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          كل مجموعة تظهر كتبويب في شاشة الطلب (عرض/تعديل/إضافة). الحقول بدون مجموعة تظهر في تبويب
          «عام».
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <Input
            placeholder="اسم المجموعة (مثال: بيانات مقدم الطلب)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="md:col-span-3"
          />
          <Button onClick={addGroup}>
            <Plus className="ms-1 h-4 w-4" /> إضافة مجموعة
          </Button>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مجموعات بعد.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g, i) => (
              <div key={g.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {i + 1}
                </Badge>
                <span className="font-medium text-sm flex-1">{g.name}</span>
                {g.system && <Badge variant="outline">افتراضي</Badge>}
                <span className="text-xs text-muted-foreground">
                  {fields.filter((f) => f.groupId === g.id).length} حقل
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveGroup(g.id, -1)}
                  disabled={i === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveGroup(g.id, 1)}
                  disabled={i === groups.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                {!g.system && (
                  <Button size="icon" variant="ghost" onClick={() => removeGroup(g.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Fields */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4">
          <Input
            placeholder="مفتاح الحقل (مثال: amount)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Input placeholder="اسم العرض" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Select value={type} onValueChange={(v) => setType(v as FieldDefinition["type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="المجموعة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>بدون مجموعة (عام)</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {type === "dynamic_select" ? (
            <div className="md:col-span-2">
              <Select
                value={sourceValue}
                onValueChange={(v) => setSourceValue(v as DynamicSourceOption)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="المصدر" />
                </SelectTrigger>
                <SelectContent>
                  {dynamicSourceOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : type === "select" ? (
            <Input
              key="manual-options"
              placeholder="خيارات (لـ القائمة، مفصولة بفواصل)"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              className="md:col-span-2"
            />
          ) : null}
          <Button onClick={add}>
            <Plus className="ms-1 h-4 w-4" /> إضافة حقل
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المفتاح</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>المجموعة</TableHead>
              <TableHead>الخيارات</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono text-xs">{f.key}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{f.label}</span>
                    {f.system && <Badge variant="outline">افتراضي</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{fieldTypeLabel(f.type)}</Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={f.groupId ?? NO_GROUP}
                    onValueChange={(v) => setFieldGroup(f.id, v)}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_GROUP}>عام</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {f.type === "dynamic_select"
                    ? f.sourceTable === "reference_data" && f.referenceTableKey
                      ? `مصدر: ${referenceTables.find((t) => t.key === f.referenceTableKey)?.label ?? f.referenceTableKey}`
                      : `مصدر: ${sourceLabel(f.sourceTable)}`
                    : (f.options?.join("، ") ?? "—")}
                </TableCell>
                <TableCell>
                  {!f.system && (
                    <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ============================================================
// Rules grid (stage × field)
// ============================================================
function RulesTab({ versionId }: { versionId: string }) {
  const stages = wfStore.stages
    .use()
    .filter((s) => s.workflowVersionId === versionId)
    .sort((a, b) => a.order - b.order);
  const fields = wfStore.fieldDefs.use().filter((f) => f.workflowVersionId === versionId);
  const rules = wfStore.fieldRules.use();
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  if (stageId && !stages.find((s) => s.id === stageId)) setStageId(stages[0]?.id ?? "");

  const ruleFor = (fieldKey: string): FieldRule | undefined =>
    rules.find((r) => r.stageId === stageId && r.fieldKey === fieldKey);

  const upsert = (fieldKey: string, patch: Partial<FieldRule>) => {
    const existing = ruleFor(fieldKey);
    if (existing) {
      wfStore.fieldRules.update((arr) =>
        arr.map((r) => (r.id === existing.id ? { ...r, ...patch } : r)),
      );
    } else {
      wfStore.fieldRules.update((arr) => [
        ...arr,
        {
          id: uid("fr"),
          stageId,
          fieldKey,
          visible: true,
          editable: true,
          required: false,
          ...patch,
        },
      ]);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 max-w-sm">
        <Label className="text-xs text-muted-foreground">المرحلة</Label>
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger>
            <SelectValue placeholder="اختر مرحلة..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الحقل</TableHead>
            <TableHead>ظاهر</TableHead>
            <TableHead>قابل للتعديل</TableHead>
            <TableHead>إلزامي</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((f) => {
            const r = ruleFor(f.key);
            const v = r?.visible ?? true;
            const e = r?.editable ?? true;
            const q = r?.required ?? false;
            return (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.label}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{f.key}</div>
                </TableCell>
                <TableCell>
                  <Switch checked={v} onCheckedChange={(c) => upsert(f.key, { visible: c })} />
                </TableCell>
                <TableCell>
                  <Switch checked={e} onCheckedChange={(c) => upsert(f.key, { editable: c })} />
                </TableCell>
                <TableCell>
                  <Switch checked={q} onCheckedChange={(c) => upsert(f.key, { required: c })} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ============================================================
// Actions library
// ============================================================
function ActionsTab() {
  const actions = wfStore.actions.use();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const add = () => {
    if (!code || !name) return toast.error("الرمز والاسم مطلوبان");
    const a: WorkflowAction = { id: uid("act"), code, name, kind: "custom" };
    wfStore.actions.update((arr) => [...arr, a]);
    setCode("");
    setName("");
  };
  const remove = (id: string) => wfStore.actions.update((arr) => arr.filter((x) => x.id !== id));

  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Input placeholder="رمز الإجراء" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input
          placeholder="اسم الإجراء"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="md:col-span-2"
        />
        <Button onClick={add}>
          <Plus className="ms-1 h-4 w-4" /> إضافة
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الرمز</TableHead>
            <TableHead>الاسم</TableHead>
            <TableHead>النوع</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actions.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-xs">{a.code}</TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{a.kind ?? "custom"}</Badge>
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
