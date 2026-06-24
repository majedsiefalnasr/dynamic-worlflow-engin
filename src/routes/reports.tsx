import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, FileSpreadsheet, FileText as FilePdf } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MONTHLY, CATEGORY_DIST } from "@/lib/mock";
import { wfStore } from "@/lib/workflow-engine";
import { instanceAmount, instanceCurrency } from "@/lib/workflow-bridge";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";
import { isApiEnabled } from "@/lib/api/client";
import {
  useReportSummary,
  useRequestsOverTime,
  useReportByCurrency,
  useReportBySector,
} from "@/lib/api/reports";
import { useSectorValues } from "@/lib/api/merchants";

export const Route = createFileRoute("/reports")({
  component: () => (
    <ScreenGuard screen="reports">
      <Reports />
    </ScreenGuard>
  ),
});

const COLORS = [
  "oklch(0.28 0.09 255)",
  "oklch(0.65 0.14 195)",
  "oklch(0.7 0.15 75)",
  "oklch(0.6 0.18 25)",
  "oklch(0.55 0.15 290)",
  "oklch(0.5 0.1 160)",
];

function Reports() {
  const instances = wfStore.instances.use();
  const total = instances.length;
  const approved = instances.filter((i) => i.status === "closed").length;
  const rejected = instances.filter((i) => i.status === "rejected").length;
  const active = instances.filter((i) => i.status === "active").length;
  const totalValue = instances.reduce((s, i) => s + instanceAmount(i), 0);
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const currencyRows = ["USD", "EUR", "SAR"].map((c) => ({
    c,
    v:
      instances
        .filter((i) => instanceCurrency(i) === c)
        .reduce((sum, i) => sum + instanceAmount(i), 0) / 1000,
  }));

  // Summary stat cards come from /reports/summary when reports is live (the
  // charts below still use mock series until the chart endpoints are verified).
  const reportsApi = isApiEnabled("reports");
  const summary = useReportSummary(reportsApi).data;
  const sTotal = reportsApi && summary ? summary.total : total;
  const sClosed = reportsApi && summary ? summary.closed : approved;
  const sRejected = reportsApi && summary ? summary.rejected : rejected;
  const sActive = reportsApi && summary ? summary.active : active;
  const sRate = sTotal > 0 ? Math.round((sClosed / sTotal) * 100) : 0;

  // Chart series: live endpoints when reports is enabled, else the mock series.
  const sectors = useSectorValues(reportsApi).data ?? [];
  const overTime = useRequestsOverTime(reportsApi).data ?? [];
  const byCurrency = useReportByCurrency(reportsApi).data ?? [];
  const bySector = useReportBySector(reportsApi, sectors).data ?? [];
  const lineData = reportsApi ? overTime.map((p) => ({ m: p.label, طلبات: p.value })) : MONTHLY;
  const pieData = reportsApi
    ? bySector.map((p) => ({ name: p.label, value: p.value }))
    : CATEGORY_DIST;
  const barData = reportsApi ? byCurrency.map((p) => ({ c: p.label, v: p.value })) : currencyRows;

  return (
    <div>
      <PageHeader
        title="التقارير والتحليلات"
        subtitle="مؤشرات محسوبة من طلبات محرّك سير العمل الديناميكي"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "التقارير" }]}
        actions={
          <>
            <Button variant="outline">
              <Calendar className="h-4 w-4 ml-1" /> الفترة: 2026
            </Button>
            <Button variant="outline">
              <FilePdf className="h-4 w-4 ml-1" /> PDF
            </Button>
            <Button>
              <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel
            </Button>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
        {[
          { l: "إجمالي الطلبات", v: sTotal.toLocaleString("en-US"), s: `${sActive} نشط` },
          {
            l: "قيمة التمويل",
            v: reportsApi ? "—" : `$${(totalValue / 1_000_000).toFixed(1)}M`,
            s: reportsApi ? "غير متاح بعد" : "من المحرّك",
          },
          { l: "طلبات مغلقة", v: sClosed.toString(), s: "مكتملة" },
          { l: "نسبة الإغلاق", v: `${sRate}%`, s: `${sRejected} مرفوض` },
          reportsApi && summary
            ? { l: "متجاوزة SLA", v: summary.overdue.toString(), s: "تنبيه" }
            : {
                l: "مراحل نشطة",
                v: new Set(instances.map((i) => i.currentStageId)).size.toString(),
                s: "تغطية",
              },
        ].map((k) => (
          <Card key={k.l} className="p-4 shadow-card border-0">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className="flex items-end justify-between mt-1">
              <div className="text-xl font-bold">{k.v}</div>
              <Badge variant="secondary" className="text-xs">
                {k.s}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-5 shadow-card border-0 lg:col-span-2">
          <h3 className="font-semibold mb-4">تطور أحجام الطلبات</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 240)" />
              <XAxis
                dataKey="m"
                fontSize={10}
                interval="preserveStartEnd"
                minTickGap={16}
                tickMargin={10}
              />
              <YAxis fontSize={11} width={34} />
              <Tooltip />
              <Legend verticalAlign="bottom" height={32} />
              <Line
                type="monotone"
                dataKey="طلبات"
                stroke="oklch(0.28 0.09 255)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="مُعتمد"
                stroke="oklch(0.62 0.15 155)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="مرفوض"
                stroke="oklch(0.6 0.22 25)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 sm:p-5 shadow-card border-0">
          <h3 className="font-semibold mb-4">حسب الفئة</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 sm:p-5 shadow-card border-0 lg:col-span-3">
          <h3 className="font-semibold mb-4">قيمة التمويل بالعملة (ألف)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="c" fontSize={11} />
              <YAxis fontSize={11} width={44} />
              <Tooltip />
              <Bar dataKey="v" fill="oklch(0.65 0.14 195)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
