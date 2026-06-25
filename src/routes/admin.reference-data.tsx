import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Database, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { referenceTablesCell, type ReferenceTable } from "@/lib/governance";
import { isApiEnabled, ApiError } from "@/lib/api/client";
import { useReferenceTablesQuery, useReferenceMutations } from "@/lib/api/reference-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reference-data")({
  component: () => (
    <RoleGuard allow={["rc_platform_admin"]} message="البيانات الأساسية متاحة لمسؤول النظام فقط.">
      <ReferenceDataPage />
    </RoleGuard>
  ),
});

// ------------------------------------------------------------
// Data controller: live backend when VITE_API_BASE_URL is set,
// otherwise the local mock cell. All hooks run every render so the
// hook order stays stable regardless of the active source.
// ------------------------------------------------------------

interface RefController {
  tables: ReferenceTable[];
  isLoading: boolean;
  error: unknown;
  busy: boolean;
  refetch: () => void;
  addTable: (key: string, label: string) => Promise<void>;
  addValue: (tableId: string, key: string, label: string) => Promise<void>;
  removeTable: (id: string) => Promise<void>;
  removeValue: (tableId: string, valueId: string) => Promise<void>;
}

function useReferenceController(): RefController {
  const apiEnabled = isApiEnabled("reference-data");
  const cellTables = referenceTablesCell.use();
  const query = useReferenceTablesQuery(apiEnabled);
  const { createTable, createValue, deactivateTable, deactivateValue } = useReferenceMutations();

  if (apiEnabled) {
    return {
      tables: query.data ?? [],
      isLoading: query.isLoading,
      error: query.error,
      busy:
        createTable.isPending ||
        createValue.isPending ||
        deactivateTable.isPending ||
        deactivateValue.isPending,
      refetch: () => void query.refetch(),
      addTable: async (key, label) => void (await createTable.mutateAsync({ key, label })),
      addValue: async (tableId, key, label) =>
        void (await createValue.mutateAsync({ tableId, key, label })),
      removeTable: async (id) => {
        const t = (query.data ?? []).find((x) => x.id === id);
        void (await deactivateTable.mutateAsync({ id, version: t?._version ?? 0 }));
      },
      removeValue: async (_tableId, valueId) => {
        const t = (query.data ?? []).find((x) => x.values.some((v) => v.id === valueId));
        const v = t?.values.find((x) => x.id === valueId);
        void (await deactivateValue.mutateAsync({ id: valueId, version: v?._version ?? 0 }));
      },
    };
  }

  return {
    tables: cellTables,
    isLoading: false,
    error: null,
    busy: false,
    refetch: () => {},
    addTable: async (key, label) => {
      referenceTablesCell.set((prev) => [
        ...prev,
        { id: `rt_${Date.now()}`, key, label, values: [] },
      ]);
    },
    addValue: async (tableId, key, label) => {
      referenceTablesCell.set((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? { ...t, values: [...t.values, { id: `rv_${Date.now()}`, key, label }] }
            : t,
        ),
      );
    },
    removeTable: async (id) => {
      referenceTablesCell.set((prev) => prev.filter((t) => t.id !== id));
    },
    removeValue: async (tableId, valueId) => {
      referenceTablesCell.set((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, values: t.values.filter((v) => v.id !== valueId) } : t,
        ),
      );
    },
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

function ReferenceDataPage() {
  const ctrl = useReferenceController();
  const { tables } = ctrl;
  const [tableKey, setTableKey] = useState("");
  const [tableLabel, setTableLabel] = useState("");

  const addTable = async () => {
    const key = tableKey.trim();
    const label = tableLabel.trim();
    if (!key || !label) return toast.error("المفتاح والاسم مطلوبان");
    if (!/^[a-z][a-z0-9_]*$/.test(key))
      return toast.error("المفتاح يجب أن يكون بالإنجليزية مثل arrival_port");
    if (tables.some((t) => t.key === key)) return toast.error("هذا المفتاح مستخدم بالفعل");
    try {
      await ctrl.addTable(key, label);
      setTableKey("");
      setTableLabel("");
      toast.success("تمت إضافة جدول داخلي");
    } catch (error) {
      toast.error(errorMessage(error, "تعذّرت إضافة الجدول"));
    }
  };

  const removeTable = async (id: string) => {
    const table = tables.find((t) => t.id === id);
    if (!table || table.system) return;
    try {
      await ctrl.removeTable(id);
      toast.success("تم حذف الجدول الداخلي");
    } catch (error) {
      toast.error(errorMessage(error, "تعذّر حذف الجدول"));
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
            <Input
              dir="ltr"
              value={tableKey}
              onChange={(e) => setTableKey(e.target.value)}
              placeholder="custom_table_key"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">اسم العرض</Label>
            <Input
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              placeholder="اسم الجدول الداخلي"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addTable} disabled={ctrl.busy}>
              <Plus className="ms-1 h-4 w-4" /> إضافة جدول
            </Button>
          </div>
        </div>
      </Card>

      {ctrl.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : ctrl.error ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {errorMessage(ctrl.error, "تعذّر تحميل البيانات الأساسية")}
          </p>
          <Button variant="outline" size="sm" onClick={ctrl.refetch}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : tables.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد جداول داخلية بعد.
        </Card>
      ) : (
        <div className="space-y-5">
          {tables.map((table) => (
            <ReferenceTableCard
              key={table.id}
              table={table}
              busy={ctrl.busy}
              onRemove={() => removeTable(table.id)}
              onAddValue={(key, label) => ctrl.addValue(table.id, key, label)}
              onRemoveValue={(valueId) => ctrl.removeValue(table.id, valueId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReferenceTableCard({
  table,
  busy,
  onRemove,
  onAddValue,
  onRemoveValue,
}: {
  table: ReferenceTable;
  busy: boolean;
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
    if (!/^[a-z][a-z0-9_]*$/.test(nextKey))
      return toast.error("مفتاح القيمة يجب أن يكون بالإنجليزية");
    if (table.values.some((v) => v.key === nextKey))
      return toast.error("هذا المفتاح مستخدم داخل الجدول");
    try {
      await onAddValue(nextKey, nextLabel);
      setKey("");
      setLabel("");
    } catch (error) {
      toast.error(errorMessage(error, "تعذّرت إضافة القيمة"));
    }
  };

  const removeValue = async (id: string) => {
    try {
      await onRemoveValue(id);
    } catch (error) {
      toast.error(errorMessage(error, "تعذّر حذف القيمة"));
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
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onRemove}
            disabled={busy}
          >
            <Trash2 className="ms-1 h-4 w-4" /> حذف الجدول
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input
          dir="ltr"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="value_key"
        />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="قيمة العرض" />
        <Button variant="outline" onClick={addValue} disabled={busy}>
          <Plus className="ms-1 h-4 w-4" /> إضافة قيمة
        </Button>
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeValue(value.id)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {table.values.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                لا توجد قيم بعد.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
