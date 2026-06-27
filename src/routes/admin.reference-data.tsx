import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Database, Loader2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useReferenceTables, useReferenceMutations, type ReferenceTable } from "@/lib/data/reference-data";
import { isDomainError } from "@/lib/data/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reference-data")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]} message="البيانات الأساسية متاحة لمسؤول النظام فقط.">
      <ReferenceDataPage />
    </RoleGuard>
  ),
});

function ReferenceDataPage() {
  const { data: tables = [], isLoading } = useReferenceTables();
  const { createTable, createValue, removeTable, removeValue } = useReferenceMutations();
  const [tableKey, setTableKey] = useState("");
  const [tableLabel, setTableLabel] = useState("");

  const addTable = async () => {
    const key = tableKey.trim();
    const label = tableLabel.trim();
    if (!key || !label) return toast.error("المفتاح والاسم مطلوبان");
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return toast.error("المفتاح يجب أن يكون بالإنجليزية مثل arrival_port");
    if (tables.some((t) => t.key === key)) return toast.error("هذا المفتاح مستخدم بالفعل");
    try {
      await createTable.mutate({ key, label });
      setTableKey("");
      setTableLabel("");
      toast.success("تمت إضافة جدول داخلي");
    } catch (e) {
      toast.error(isDomainError(e) ? e.message : "تعذر إضافة الجدول");
    }
  };

  const onRemoveTable = async (id: string) => {
    const table = tables.find((t) => t.id === id);
    if (!table || table.system) return;
    try {
      await removeTable.mutate({ id });
      toast.success("تم حذف الجدول الداخلي");
    } catch (e) {
      toast.error(isDomainError(e) ? e.message : "تعذر حذف الجدول");
    }
  };

  return (
    <div>
      <PageHeader
        title="البيانات الأساسية"
        subtitle="إدارة الجداول الداخلية التي تغذي قوائم الاختيار في النماذج ومصمم سير العمل."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "البيانات الأساسية" }]}
      />

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">إضافة جدول داخلي</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">المفتاح</Label>
            <Input dir="ltr" value={tableKey} onChange={(e) => setTableKey(e.target.value)} placeholder="custom_table_key" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">اسم العرض</Label>
            <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} placeholder="اسم الجدول الداخلي" />
          </div>
          <div className="flex items-end">
            <Button onClick={addTable}><Plus className="ms-1 h-4 w-4" /> إضافة جدول</Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
        </div>
      ) : (
        <div className="space-y-5">
          {tables.map((table) => (
            <ReferenceTableCard
              key={table.id}
              table={table}
              onRemove={() => onRemoveTable(table.id)}
              onAddValue={async (k, l) => {
                await createValue.mutate({ tableId: table.id, key: k, label: l });
              }}
              onRemoveValue={async (id) => {
                try {
                  await removeValue.mutate({ id });
                } catch (e) {
                  toast.error(isDomainError(e) ? e.message : "تعذر حذف القيمة");
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReferenceTableCard({
  table, onRemove, onAddValue, onRemoveValue,
}: {
  table: ReferenceTable;
  onRemove: () => void;
  onAddValue: (key: string, label: string) => Promise<void>;
  onRemoveValue: (valueId: string) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");

  const addValue = async () => {
    const nextKey = key.trim();
    const nextLabel = label.trim();
    if (!nextKey || !nextLabel) return toast.error("مفتاح وقيمة البيان مطلوبان");
    if (!/^[a-z][a-z0-9_]*$/.test(nextKey)) return toast.error("مفتاح القيمة يجب أن يكون بالإنجليزية");
    if (table.values.some((v) => v.key === nextKey)) return toast.error("هذا المفتاح مستخدم داخل الجدول");
    try {
      await onAddValue(nextKey, nextLabel);
      setKey("");
      setLabel("");
    } catch (e) {
      toast.error(isDomainError(e) ? e.message : "تعذر إضافة القيمة");
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{table.label}</h2>
            {table.system && <Badge variant="outline">افتراضي</Badge>}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{table.key}</div>
        </div>
        {!table.system && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            <Trash2 className="ms-1 h-4 w-4" /> حذف الجدول
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} placeholder="value_key" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="قيمة العرض" />
        <Button variant="outline" onClick={addValue}><Plus className="ms-1 h-4 w-4" /> إضافة قيمة</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>المفتاح</TableHead>
            <TableHead>القيمة</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.values.map((value) => (
            <TableRow key={value.id}>
              <TableCell className="font-mono text-xs">{value.key}</TableCell>
              <TableCell>{value.label}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => onRemoveValue(value.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {table.values.length === 0 && (
            <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا توجد قيم بعد.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
