import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { DynamicSource, FieldDefinition, FieldGroup } from "@/lib/workflow-engine";
import { MERCHANTS } from "@/lib/mock";

/** Options for a `dynamic_select` field sourced from a reference table. */
function dynamicOptions(source: DynamicSource | undefined): string[] {
  switch (source) {
    case "merchants":
      return MERCHANTS.map((m) => m.name);
    default:
      return [];
  }
}

export type DynamicField = {
  def: FieldDefinition;
  visible: boolean;
  editable: boolean;
  required: boolean;
  groupId?: string;
};

interface Props {
  fields: DynamicField[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  groups?: FieldGroup[];
  /** Force every field into view-only mode regardless of the stage's edit rules. */
  readOnly?: boolean;
}

const UNGROUPED_ID = "__ungrouped";

/**
 * Metadata-driven form renderer. Reads field defs + per-stage rules and
 * produces the appropriate input control, enforcing visible/editable/required.
 * When field groups are defined, visible fields are split into tabs.
 */
export function DynamicForm({ fields, value, onChange, groups, readOnly = false }: Props) {
  const [activeTab, setActiveTab] = useState<string>("");
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  // When the user can't act on the request, every field is view-only even if
  // the stage rules mark it editable (e.g. admin viewing a draft).
  const effFields = readOnly ? fields.map((f) => ({ ...f, editable: false })) : fields;
  const visible = effFields.filter((f) => f.visible);

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد حقول معروضة لهذه المرحلة.</p>;
  }

  // Build ordered tabs from the groups that actually have visible fields,
  // appending an "عام" tab for any ungrouped visible fields.
  const ordered = (groups ?? []).slice().sort((a, b) => a.order - b.order);
  const tabs = ordered
    .map((g) => ({ id: g.id, name: g.name, items: visible.filter((f) => (f.groupId ?? f.def.groupId) === g.id) }))
    .filter((t) => t.items.length > 0);
  const ungrouped = visible.filter(
    (f) => !ordered.some((g) => g.id === (f.groupId ?? f.def.groupId)),
  );
  if (ungrouped.length > 0) {
    tabs.push({ id: UNGROUPED_ID, name: "عام", items: ungrouped });
  }

  // No meaningful grouping → flat grid (backward compatible).
  if (tabs.length <= 1) {
    return <FieldsGrid items={visible} value={value} onSet={set} />;
  }

  const tabIds = tabs.map((t) => t.id);
  const current = tabIds.includes(activeTab) ? activeTab : tabs[0].id;
  const idx = tabIds.indexOf(current);
  const isFirst = idx === 0;
  const isLast = idx === tabs.length - 1;

  return (
    <Tabs value={current} onValueChange={setActiveTab}>
      <TabsList className="mb-4 flex-wrap h-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
            {t.name}
            <Badge variant="secondary" className="text-[10px] px-1.5">{t.items.length}</Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          <FieldsGrid items={t.items} value={value} onSet={set} />
        </TabsContent>
      ))}

      {/* Wizard-style navigation between groups (RTL: "السابق" points right, "التالي" points left). */}
      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFirst}
          onClick={() => setActiveTab(tabIds[Math.max(0, idx - 1)])}
        >
          <ChevronRight className="h-4 w-4 ms-1" /> السابق
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {tabs[idx].name} — خطوة {idx + 1} من {tabs.length}
        </span>
        <Button
          type="button"
          variant={isLast ? "outline" : "default"}
          size="sm"
          disabled={isLast}
          onClick={() => setActiveTab(tabIds[Math.min(tabIds.length - 1, idx + 1)])}
        >
          التالي <ChevronLeft className="h-4 w-4 me-1" />
        </Button>
      </div>
    </Tabs>
  );
}

function FieldsGrid({
  items, value, onSet,
}: { items: DynamicField[]; value: Record<string, unknown>; onSet: (key: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((f) => (
        <FieldControl key={f.def.id} field={f} value={value[f.def.key]} onSet={(v) => onSet(f.def.key, v)} />
      ))}
    </div>
  );
}

function FieldControl({
  field, value, onSet,
}: { field: DynamicField; value: unknown; onSet: (v: unknown) => void }) {
  const { def, editable, required } = field;
  const disabled = !editable;
  const id = `field-${def.key}`;
  const label = (
    <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
      {def.label} {required && <span className="text-destructive">*</span>}
    </Label>
  );

  switch (def.type) {
    case "textarea":
      return (
        <div className="md:col-span-2 space-y-1.5">
          {label}
          <Textarea id={id} value={(value as string) ?? ""} disabled={disabled}
            onChange={(e) => onSet(e.target.value)} rows={3} />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ""} disabled={disabled} onValueChange={(v) => onSet(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {(def.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "dynamic_select": {
      const opts = dynamicOptions(def.sourceTable);
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ""} disabled={disabled} onValueChange={(v) => onSet(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {opts.length === 0
                ? <div className="px-2 py-1.5 text-xs text-muted-foreground">لا توجد بيانات في المصدر</div>
                : opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "checkbox":
      return (
        <div className="flex items-center gap-2 pt-5">
          <Checkbox id={id} checked={Boolean(value)} disabled={disabled}
            onCheckedChange={(c) => onSet(Boolean(c))} />
          {label}
        </div>
      );
    case "file":
      return (
        <div className="space-y-1.5 md:col-span-2">
          {label}
          <Input id={id} type="file" disabled={disabled}
            onChange={(e) => onSet(e.target.files?.[0]?.name ?? "")} />
          {typeof value === "string" && value && (
            <p className="text-[11px] text-muted-foreground">الملف الحالي: {value}</p>
          )}
        </div>
      );
    case "number":
    case "currency":
      return (
        <div className="space-y-1.5">
          {label}
          <Input id={id} type="number" value={(value as number | string) ?? ""}
            disabled={disabled} onChange={(e) => onSet(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1.5">
          {label}
          <Input id={id} type="date" value={(value as string) ?? ""} disabled={disabled}
            onChange={(e) => onSet(e.target.value)} />
        </div>
      );
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input id={id} value={(value as string) ?? ""} disabled={disabled}
            onChange={(e) => onSet(e.target.value)} />
        </div>
      );
  }
}

export function validateRequired(fields: DynamicField[], value: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.visible && f.editable && f.required)
    .filter((f) => {
      const v = value[f.def.key];
      return v === undefined || v === null || v === "";
    })
    .map((f) => f.def.label);
}

export function useFormState(initial: Record<string, unknown>) {
  const [data, setData] = useState(initial);
  return { data, setData };
}
