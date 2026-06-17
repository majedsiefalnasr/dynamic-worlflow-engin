import { createFileRoute } from "@tanstack/react-router";
import { Settings as Cog, Mail, Bell, Workflow, ShieldAlert, Database, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { resetDemoData } from "@/lib/governance";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="إعدادات النظام"
        subtitle="إدارة سير العمل، الإشعارات، والأمن"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "الإعدادات" }]}
      />

      <Tabs defaultValue="workflow">
        <TabsList>
          <TabsTrigger value="workflow"><Workflow className="h-4 w-4 ml-1" /> سير العمل</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 ml-1" /> البريد</TabsTrigger>
          <TabsTrigger value="notif"><Bell className="h-4 w-4 ml-1" /> الإشعارات</TabsTrigger>
          <TabsTrigger value="security"><ShieldAlert className="h-4 w-4 ml-1" /> الأمن</TabsTrigger>
          <TabsTrigger value="general"><Cog className="h-4 w-4 ml-1" /> عام</TabsTrigger>
          <TabsTrigger value="demo"><Database className="h-4 w-4 ml-1" /> بيانات العرض</TabsTrigger>
        </TabsList>

        <TabsContent value="demo" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Database className="h-4 w-4" /> إعادة تعيين بيانات العرض التوضيحي</h3>
              <p className="text-sm text-muted-foreground mt-1">
                يحذف جميع التغييرات المحفوظة محلياً (طلبات المحرّك، الإشعارات، إعدادات الجهات، الفرق، والأدوار) ويعيد تحميل البيانات الأولية.
                هذا الإجراء لا رجعة فيه ضمن جلسة العرض.
              </p>
            </div>
            <Button variant="destructive" onClick={() => { if (confirm("سيتم مسح جميع البيانات المحلية وإعادة التحميل. متابعة؟")) resetDemoData(); }}>
              <RefreshCw className="h-4 w-4 ml-1" /> إعادة تعيين كاملة
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات محرّك سير العمل</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2"><Label>اسم سير العمل الافتراضي</Label><Input defaultValue="تمويل الواردات" /></div>
              <div className="space-y-2"><Label>عدد المراحل النشطة</Label><Input defaultValue="8" /></div>
              <div className="space-y-2"><Label>نسخة المحرّك الحالية</Label><Input defaultValue="1.0" /></div>
              <div className="space-y-2"><Label>مهلة المراجعة (ساعات)</Label><Input defaultValue="48" /></div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div><div className="font-medium text-sm">استخدام قواعد الحقول من المصمم</div><div className="text-xs text-muted-foreground">إظهار/إخفاء وتعديل الحقول حسب المرحلة الحالية</div></div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div><div className="font-medium text-sm">تفعيل سجل تاريخ سير العمل</div></div>
              <Switch defaultChecked />
            </div>
            <Button>حفظ التغييرات</Button>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات SMTP</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2"><Label>SMTP Host</Label><Input defaultValue="smtp.cby.gov.ye" /></div>
              <div className="space-y-2"><Label>Port</Label><Input defaultValue="587" /></div>
              <div className="space-y-2"><Label>المستخدم</Label><Input defaultValue="noreply@cby.gov.ye" /></div>
              <div className="space-y-2"><Label>كلمة المرور</Label><Input type="password" defaultValue="************" /></div>
            </div>
            <div className="space-y-2">
              <Label>قالب إشعار اعتماد طلب</Label>
              <Textarea rows={4} defaultValue="عزيزي {{importerName}}،&#10;تم تنفيذ إجراء جديد على الطلب رقم {{invoiceNumber}} داخل محرّك سير العمل." />
            </div>
            <Button>حفظ</Button>
          </Card>
        </TabsContent>

        <TabsContent value="notif" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-3">
            <h3 className="font-semibold mb-2">قنوات الإشعارات</h3>
            {[
              "البريد الإلكتروني عند تقديم طلب جديد",
              "إشعار داخل المنصة عند تغيير حالة طلب",
              "SMS عند اعتماد/رفض الطلب",
              "تنبيه فوري عند اكتشاف فاتورة مكررة",
              "تقرير يومي بإجمالي النشاط",
            ].map((t) => (
              <div key={t} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="text-sm">{t}</div>
                <Switch defaultChecked />
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-3">
            <h3 className="font-semibold mb-2">سياسات الأمن</h3>
            {[
              ["إلزام المصادقة الثنائية MFA", true],
              ["انتهاء كلمة المرور كل 90 يوم", true],
              ["قفل الحساب بعد 5 محاولات فاشلة", true],
              ["تشفير الوثائق المرفوعة AES-256", true],
              ["تسجيل كل عملية في سجل التدقيق", true],
              ["السماح بالوصول من خارج الشبكة", false],
            ].map(([t, v]) => (
              <div key={t as string} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="text-sm">{t}</div>
                <Switch defaultChecked={v as boolean} />
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات عامة</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2"><Label>اسم المنصة</Label><Input defaultValue="منصة إدارة وتمويل الواردات" /></div>
              <div className="space-y-2"><Label>الجهة</Label><Input defaultValue="البنك المركزي اليمني" /></div>
              <div className="space-y-2"><Label>اللغة الافتراضية</Label><Input defaultValue="العربية" /></div>
              <div className="space-y-2"><Label>المنطقة الزمنية</Label><Input defaultValue="GMT+3 (Arabia)" /></div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-info/5 border border-info/20">
              <Database className="h-5 w-5 text-info" />
              <div className="text-xs">آخر نسخة احتياطية: <span className="font-semibold">29 أكتوبر 2025 — 02:00</span></div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
