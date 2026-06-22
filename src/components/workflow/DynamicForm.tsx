import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileText, Search, Upload } from "lucide-react";
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
import type { FieldDefinition, FieldGroup } from "@/lib/workflow-engine";
import { MERCHANTS } from "@/lib/mock";
import { referenceLabels, referenceTablesCell } from "@/lib/governance";

/** Options for a `dynamic_select` field sourced from a reference table. */
function merchantByTax(tax: unknown) {
  const value = typeof tax === "string" ? tax.trim() : "";
  if (!value) return undefined;
  return MERCHANTS.find((m) => m.tax === value);
}

function merchantByName(name: unknown) {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return undefined;
  return MERCHANTS.find((m) => m.name === value);
}

function merchantCompanies(merchant: ReturnType<typeof merchantByName> | ReturnType<typeof merchantByTax>): string[] {
  if (!merchant) return [];
  return (merchant.linkedCompanies?.length ? merchant.linkedCompanies : [{
    id: `${merchant.id}_main`,
    name: merchant.name,
    category: merchant.category,
    cr: merchant.cr,
    crExpiry: merchant.commercialRegistrationExpiry ?? "",
  }]).map((c) => c.name);
}

function companyFor(merchant: ReturnType<typeof merchantByName> | ReturnType<typeof merchantByTax>, name: unknown) {
  if (!merchant || typeof name !== "string") return undefined;
  return (merchant.linkedCompanies ?? []).find((c) => c.name === name);
}

/** Options for a `dynamic_select` field sourced from runtime data. */
function dynamicOptions(def: FieldDefinition, value: Record<string, unknown>): string[] {
  switch (def.sourceTable) {
    case "merchants":
      return MERCHANTS.map((m) => m.name);
    case "merchant_companies":
      return merchantCompanies(merchantByName(value.importerName) ?? merchantByTax(value.taxNumber));
    case "reference_data":
      return def.referenceTableKey ? referenceLabels(def.referenceTableKey) : [];
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
// Merchant data is auto-filled from the tax number (and the linked-company
// selection), so these fields are always view-only. `linkedCompany` stays
// editable because picking it is what drives the commercial-registration fields.
const LOCKED_MERCHANT_FIELDS = new Set([
  "importerName",
  "taxCardExpiry",
  "commercialRegistration",
  "commercialRegistrationExpiry",
  "owners",
]);

/**
 * Metadata-driven form renderer. Reads field defs + per-stage rules and
 * produces the appropriate input control, enforcing visible/editable/required.
 * When field groups are defined, visible fields are split into tabs.
 */
export function DynamicForm({ fields, value, onChange, groups, readOnly = false }: Props) {
  referenceTablesCell.use();
  const [activeTab, setActiveTab] = useState<string>("");
  const set = (key: string, v: unknown) => {
    const next = { ...value, [key]: v };
    if (key === "taxNumber") {
      const merchant = merchantByTax(v);
      if (merchant) {
        const companies = merchant.linkedCompanies ?? [];
        const firstCompany = companies[0];
        next.importerName = merchant.name;
        next.taxCardExpiry = merchant.taxCardExpiry ?? "";
        next.linkedCompany = firstCompany?.name ?? merchant.name;
        next.commercialRegistration = firstCompany?.cr ?? merchant.cr;
        next.commercialRegistrationExpiry = firstCompany?.crExpiry ?? merchant.commercialRegistrationExpiry ?? "";
        next.owners = (merchant.owners ?? []).map((o) => `${o.name} - ${o.share}%`).join("\n");
      }
    }
    if (key === "importerName") {
      const merchant = merchantByName(v);
      if (merchant) {
        const firstCompany = merchant.linkedCompanies?.[0];
        next.taxNumber = merchant.tax;
        next.taxCardExpiry = merchant.taxCardExpiry ?? "";
        next.linkedCompany = firstCompany?.name ?? merchant.name;
        next.commercialRegistration = firstCompany?.cr ?? merchant.cr;
        next.commercialRegistrationExpiry = firstCompany?.crExpiry ?? merchant.commercialRegistrationExpiry ?? "";
        next.owners = (merchant.owners ?? []).map((o) => `${o.name} - ${o.share}%`).join("\n");
      }
    }
    if (key === "paymentTerms" && v === "كلي") {
      next.requestPercentage = 100;
    }
    if (key === "linkedCompany") {
      const merchant = merchantByName(next.importerName) ?? merchantByTax(next.taxNumber);
      const company = companyFor(merchant, v);
      if (company) {
        next.commercialRegistration = company.cr;
        next.commercialRegistrationExpiry = company.crExpiry;
      }
    }
    onChange(next);
  };
  // When the user can't act on the request, every field is view-only even if
  // the stage rules mark it editable (e.g. admin viewing a draft).
  const effFields = readOnly ? fields.map((f) => ({ ...f, editable: false })) : fields;
  const visible = effFields.filter((f) => f.visible);
  const hasEditableFields = visible.some((field) => field.editable);

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

  if (readOnly || !hasEditableFields) {
    return <ReadOnlyForm tabs={tabs} value={value} />;
  }

  const tabIds = tabs.map((t) => t.id);
  const wizardSteps = [...tabs, { id: "__review", name: "المراجعة والإرسال", items: [] }];
  const wizardIds = wizardSteps.map((t) => t.id);
  const current = tabIds.includes(activeTab) ? activeTab : tabs[0].id;
  const currentWizard = wizardIds.includes(activeTab) ? activeTab : current;
  const idx = wizardIds.indexOf(currentWizard);
  const isFirst = idx === 0;
  const isLast = idx === wizardIds.length - 1;
  const currentStep = wizardSteps[idx];
  const currentItems = currentStep.id === "__review" ? [] : currentStep.items;
  const goNext = () => {
    setActiveTab(wizardIds[Math.min(wizardIds.length - 1, idx + 1)]);
  };

  const changeStep = (target: string) => {
    setActiveTab(target);
  };

  return (
    <Tabs value={currentWizard} onValueChange={changeStep}>
      <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-between gap-2 rounded-2xl bg-muted/40 p-3">
        {wizardSteps.map((t, stepIdx) => {
          const done = stepIdx < idx;
          const active = stepIdx === idx;
          return (
            <TabsTrigger key={t.id} value={t.id} className="min-w-32 flex-1 gap-2 rounded-xl py-3 data-[state=active]:bg-background">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="h-4 w-4" /> : stepIdx + 1}
              </span>
              <span>{t.name}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          <FieldsGrid items={t.items} value={value} onSet={set} />
        </TabsContent>
      ))}
      <TabsContent value="__review">
        <ReviewStep fields={visible} groups={tabs} value={value} />
      </TabsContent>

      {/* Wizard-style navigation between groups (RTL: "السابق" points right, "التالي" points left). */}
      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFirst}
          onClick={() => setActiveTab(wizardIds[Math.max(0, idx - 1)])}
        >
          <ChevronRight className="h-4 w-4 ms-1" /> السابق
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {wizardSteps[idx].name} — خطوة {idx + 1} من {wizardSteps.length}
        </span>
        <Button
          type="button"
          variant={isLast ? "outline" : "default"}
          size="sm"
          disabled={isLast}
          onClick={goNext}
        >
          التالي <ChevronLeft className="h-4 w-4 me-1" />
        </Button>
      </div>
    </Tabs>
  );
}

function ReadOnlyForm({
  tabs, value,
}: {
  tabs: { id: string; name: string; items: DynamicField[] }[];
  value: Record<string, unknown>;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  const current = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;

  if (!current) {
    return <p className="text-sm text-muted-foreground">لا توجد بيانات للعرض.</p>;
  }

  return (
    <Tabs value={current} onValueChange={setActiveTab}>
      {tabs.length > 1 && (
        <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="min-h-10 flex-none px-4 data-[state=active]:bg-background"
            >
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="mt-0">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-0 md:grid-cols-2">
            {tab.items.map((field) => (
              <ReadOnlyField
                key={field.def.id}
                field={field}
                value={value[field.def.key]}
              />
            ))}
          </dl>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ReadOnlyField({ field, value }: { field: DynamicField; value: unknown }) {
  const isLongText = field.def.type === "textarea";
  const isFile = field.def.type === "file";

  return (
    <div className={`border-b py-3.5 last:border-b-0 ${isLongText ? "md:col-span-2" : ""}`}>
      <dt className="mb-1 text-xs font-medium text-muted-foreground">{field.def.label}</dt>
      <dd className={`text-sm font-medium leading-6 text-foreground ${isLongText ? "whitespace-pre-wrap" : "break-words"}`}>
        {isFile && hasValue(value) ? (
          <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted/70 px-2.5 py-1.5">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{String(value)}</span>
          </span>
        ) : (
          formatDisplayValue(field.def.type, value)
        )}
      </dd>
    </div>
  );
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function formatDisplayValue(type: FieldDefinition["type"], value: unknown): string {
  if (!hasValue(value)) return "غير متوفر";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (type === "date" && typeof value === "string") {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("ar");
  }
  return String(value);
}

function FieldsGrid({
  items, value, onSet,
}: { items: DynamicField[]; value: Record<string, unknown>; onSet: (key: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((f) => (
        <FieldControl key={f.def.id} field={f} formValue={value} value={value[f.def.key]} onSet={(v) => onSet(f.def.key, v)} />
      ))}
    </div>
  );
}

function FieldControl({
  field, formValue, value, onSet,
}: { field: DynamicField; formValue: Record<string, unknown>; value: unknown; onSet: (v: unknown) => void }) {
  const { def, editable, required } = field;
  const lockedByFullCoverage = def.key === "requestPercentage" && formValue.paymentTerms === "كلي";
  const disabled = !editable || LOCKED_MERCHANT_FIELDS.has(def.key) || lockedByFullCoverage;
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
    case "select": {
      const selectOptions = def.referenceTableKey ? referenceLabels(def.referenceTableKey) : (def.options ?? []);
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ""} disabled={disabled} onValueChange={(v) => onSet(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {selectOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "dynamic_select": {
      const opts = dynamicOptions(def, formValue);
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ""} disabled={disabled} onValueChange={(v) => onSet(v)}>
            <SelectTrigger id={id}><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {opts.length === 0
                ? <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground">لا توجد بيانات في المصدر</div>
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
      return <FileUploadCard id={id} label={def.label} required={required} disabled={disabled} value={value} onSet={onSet} />;
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
          <div className={def.key === "taxNumber" ? "relative" : undefined}>
            {def.key === "taxNumber" && <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
            <Input id={id} value={(value as string) ?? ""} disabled={disabled}
              className={def.key === "taxNumber" ? "pr-10" : undefined}
              placeholder={def.key === "taxNumber" ? "أدخل الرقم الضريبي ثم اضغط بحث" : undefined}
              onChange={(e) => onSet(e.target.value)} />
          </div>
        </div>
      );
  }
}

function FileUploadCard({
  id, label, required, disabled, value, onSet,
}: {
  id: string; label: string; required: boolean; disabled: boolean; value: unknown; onSet: (v: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileName = typeof value === "string" ? value : "";
  return (
    <div className="space-y-1.5">
      <div className="rounded-xl border border-dashed border-border p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {required ? (
                <Badge variant="destructive" className="text-xs shrink-0">إلزامي</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs shrink-0">اختياري</Badge>
              )}
            </div>
            <div className="font-semibold text-sm mt-2">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {required ? "مطلوب" : "اختياري"} · PDF, JPG (حد أقصى 10MB)
            </div>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-muted-foreground">
            <Upload className="h-5 w-5" />
          </div>
        </div>
        {fileName ? (
          <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-xs">
            <span className="font-medium truncate">{fileName}</span>
            {!disabled && (
              <button
                type="button"
                className="text-destructive hover:underline shrink-0 ms-2"
                onClick={() => { onSet(""); if (inputRef.current) inputRef.current.value = ""; }}
              >
                إزالة
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            className="w-full rounded-lg border bg-background py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> اضغط للرفع
          </button>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          disabled={disabled}
          onChange={(e) => onSet(e.target.files?.[0]?.name ?? "")}
        />
      </div>
    </div>
  );
}

function ReviewStep({
  fields, groups, value,
}: { fields: DynamicField[]; groups: { id: string; name: string; items: DynamicField[] }[]; value: Record<string, unknown> }) {
  return (
    <div className="rounded-2xl border bg-muted/10 p-5">
      <h3 className="mb-4 text-lg font-semibold">مراجعة الطلب قبل الإرسال</h3>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.id} className="border-b pb-4 last:border-b-0">
            <h4 className="mb-3 font-semibold">{g.name}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {g.items.map((f) => (
                <div key={f.def.id} className="grid grid-cols-2 gap-3 text-sm">
                  <span className="text-muted-foreground">{f.def.label}</span>
                  <span className="font-medium">{formatReviewValue(value[f.def.key])}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {fields.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات للعرض.</p>}
      </div>
    </div>
  );
}

function formatReviewValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  return String(v);
}

export function useFormState(initial: Record<string, unknown>) {
  const [data, setData] = useState(initial);
  return { data, setData };
}
