import { createFileRoute } from "@tanstack/react-router";
import { Search, AlertTriangle, ShieldCheck, FileWarning, Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auditCell } from "@/lib/governance";
import { wfStore, type WorkflowInstance } from "@/lib/workflow-engine";
import { instanceRef, stringValue } from "@/lib/workflow-bridge";
import { useState } from "react";
import { ScreenGuard } from "@/components/workflow/ScreenGuard";

export const Route = createFileRoute("/audit")({
  component: () => (
    <ScreenGuard screen="audit" message="سجل التدقيق غير متاح لدورك وفق صلاحيات ظهور الشاشات.">
      <Audit />
    </ScreenGuard>
  ),
});

function Audit() {
  const AUDIT = auditCell.use();
  const instances = wfStore.instances.use();
  const [q, setQ] = useState("");
  const filtered = AUDIT.filter(a => !q || a.userName.includes(q) || a.action.includes(q) || a.ref.includes(q));
  const duplicates = duplicateInvoices(instances);

  return (
    <div>
      <PageHeader
        title="التدقيق والامتثال"
        subtitle="سجل النشاط، كشف الفواتير المكررة، وتنبيهات المخاطر الأمنية"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "التدقيق والامتثال" }]}
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { l: "نشاطات اليوم", v: AUDIT.length.toString(), icon: Activity, tone: "text-info bg-info/10" },
          { l: "تنبيهات مفتوحة", v: "9", icon: AlertTriangle, tone: "text-warning bg-warning/10" },
          { l: "فواتير مكررة", v: duplicates.length.toString(), icon: FileWarning, tone: "text-destructive bg-destructive/10" },
          { l: "حالات احتيال محتملة", v: "2", icon: ShieldCheck, tone: "text-destructive bg-destructive/10" },
        ].map((k) => (
          <Card key={k.l} className="p-4 shadow-card border-0 flex items-center gap-3">
            <div className={`h-11 w-11 rounded-xl grid place-items-center ${k.tone}`}><k.icon className="h-5 w-5" /></div>
            <div>
              <div className="text-xs text-muted-foreground">{k.l}</div>
              <div className="text-xl font-bold">{k.v}</div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">سجل النشاط</TabsTrigger>
          <TabsTrigger value="dup">الفواتير المكررة</TabsTrigger>
          <TabsTrigger value="risk">مؤشرات المخاطر</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          <Card className="shadow-card border-0">
            <div className="p-4 border-b">
              <div className="relative max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pr-10" placeholder="بحث في السجل: مستخدم، إجراء، رقم طلب..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-4 py-3">المستخدم</th>
                    <th className="px-4 py-3">الإجراء</th>
                    <th className="px-4 py-3">الطلب</th>
                    <th className="px-4 py-3">الجهاز</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3">التوقيت</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{a.userName}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{a.action}</Badge></td>
                      <td className="px-4 py-3 font-mono text-xs text-accent">{a.ref}</td>
                      <td className="px-4 py-3 text-xs">{a.device}</td>
                      <td className="px-4 py-3 font-mono text-xs">{a.ip}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(a.ts).toLocaleString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dup" className="mt-4">
          <Card className="p-5 shadow-card border-0">
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="text-sm">
                <span className="font-semibold">تم اكتشاف {duplicates.length} حالات</span> لفواتير مكررة بحاجة لمراجعة عاجلة.
              </div>
            </div>
            <div className="space-y-3">
              {duplicates.map((d) => (
                <div key={d.invoice} className="border rounded-lg p-4 hover:border-destructive/40">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">مكرر</Badge>
                        <span className="font-mono font-semibold">{d.invoice}</span>
                      </div>
                      <div className="text-sm font-medium mt-1">فاتورة مستخدمة في أكثر من طلب</div>
                      <div className="text-xs text-muted-foreground">الطلبات: <span className="font-mono">{d.refs.join("، ")}</span></div>
                    </div>
                    <div className="text-left text-xs text-muted-foreground">
                      {d.refs.length} طلبات
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Card className="p-5 shadow-card border-0">
            <h3 className="font-semibold mb-4">مؤشرات المخاطر النشطة</h3>
            <div className="space-y-3">
              {[
                { t: "نمط طلبات غير عادي", b: "مستخدم u00432 قدّم 14 طلب في 30 دقيقة", l: "عالية" },
                { t: "محاولة تسجيل دخول مشبوهة", b: "5 محاولات فاشلة من IP 196.4.112.18", l: "عالية" },
                { t: "تعديل فاتورة بعد الاعتماد", b: "تعديل على IMP-2025-1011", l: "متوسطة" },
                { t: "وثيقة بصلاحية منتهية", b: "شهادة منشأ على IMP-2025-1027", l: "منخفضة" },
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                  <ShieldCheck className={`h-5 w-5 mt-0.5 ${r.l === "عالية" ? "text-destructive" : r.l === "متوسطة" ? "text-warning" : "text-info"}`} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{r.t}</div>
                    <div className="text-xs text-muted-foreground">{r.b}</div>
                  </div>
                  <Badge variant={r.l === "عالية" ? "destructive" : "secondary"}>{r.l}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function duplicateInvoices(instances: WorkflowInstance[]) {
  const invoices = new Map<string, string[]>();
  instances.forEach((inst) => {
    const invoice = stringValue(inst.data.invoiceNumber);
    if (!invoice) return;
    invoices.set(invoice, [...(invoices.get(invoice) ?? []), instanceRef(inst)]);
  });
  return [...invoices.entries()]
    .filter(([, refs]) => refs.length > 1)
    .map(([invoice, refs]) => ({ invoice, refs }));
}
