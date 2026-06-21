import { createFileRoute } from "@tanstack/react-router";
import {
  Settings as Cog,
  Mail,
  Bell,
  Workflow,
  ShieldAlert,
  Database,
  RefreshCw,
} from "lucide-react";
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
        subtitle="ضبط سير العمل وقنوات الإشعارات وسياسات الوصول وإعدادات المنصة."
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "الإعدادات" }]}
      />

      <Tabs defaultValue="workflow">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="workflow">
            <Workflow className="h-4 w-4 ml-1" /> سير العمل
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="email">
            <Mail className="h-4 w-4 ml-1" /> البريد
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="notif">
            <Bell className="h-4 w-4 ml-1" /> الإشعارات
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="security">
            <ShieldAlert className="h-4 w-4 ml-1" /> الأمن
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="general">
            <Cog className="h-4 w-4 ml-1" /> عام
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 basis-32 sm:flex-none" value="demo">
            <Database className="h-4 w-4 ml-1" /> بيانات العرض
          </TabsTrigger>
        </TabsList>

        <TabsContent value="demo" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" /> إعادة تعيين بيانات العرض التوضيحي
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                يحذف جميع التغييرات المحفوظة محلياً (طلبات المحرّك، الإشعارات، إعدادات الجهات،
                الفرق، والأدوار) ويعيد تحميل البيانات الأولية. هذا الإجراء لا رجعة فيه ضمن جلسة
                العرض.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("سيتم مسح جميع البيانات المحلية وإعادة التحميل. متابعة؟"))
                  resetDemoData();
              }}
            >
              <RefreshCw className="h-4 w-4 ml-1" /> إعادة تعيين كاملة
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات محرّك سير العمل</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">اسم سير العمل الافتراضي</Label>
                <Input id="workflow-name" defaultValue="تمويل الواردات" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-stage-count">عدد المراحل النشطة</Label>
                <Input id="workflow-stage-count" defaultValue="8" inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-version">نسخة المحرّك الحالية</Label>
                <Input id="workflow-version" defaultValue="1.0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-review-hours">مهلة المراجعة (ساعات)</Label>
                <Input id="workflow-review-hours" defaultValue="48" inputMode="numeric" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="font-medium text-sm">استخدام قواعد الحقول من المصمم</div>
                <div className="text-xs text-muted-foreground">
                  إظهار/إخفاء وتعديل الحقول حسب المرحلة الحالية
                </div>
              </div>
              <Switch defaultChecked aria-label="استخدام قواعد الحقول من المصمم" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="font-medium text-sm">تفعيل سجل تاريخ سير العمل</div>
              </div>
              <Switch defaultChecked aria-label="تفعيل سجل تاريخ سير العمل" />
            </div>
            <Button>حفظ التغييرات</Button>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات SMTP</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">خادم SMTP</Label>
                <Input id="smtp-host" defaultValue="smtp.cby.gov.ye" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">المنفذ</Label>
                <Input id="smtp-port" defaultValue="587" inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-user">المستخدم</Label>
                <Input id="smtp-user" defaultValue="noreply@cby.gov.ye" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-password">كلمة المرور</Label>
                <Input id="smtp-password" type="password" defaultValue="************" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-email-template">قالب إشعار اعتماد طلب</Label>
              <Textarea
                id="approval-email-template"
                rows={4}
                defaultValue="عزيزي {{importerName}}،&#10;تم تنفيذ إجراء جديد على الطلب رقم {{invoiceNumber}} داخل محرّك سير العمل."
              />
            </div>
            <Button>حفظ إعدادات البريد</Button>
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
                <Switch defaultChecked aria-label={t} />
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
              <div
                key={t as string}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="text-sm">{t}</div>
                <Switch defaultChecked={v as boolean} aria-label={t as string} />
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <Card className="p-6 shadow-card border-0 space-y-5">
            <h3 className="font-semibold">إعدادات عامة</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="platform-name">اسم المنصة</Label>
                <Input id="platform-name" defaultValue="منصة إدارة وتمويل الواردات" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-organization">الجهة</Label>
                <Input id="platform-organization" defaultValue="البنك المركزي اليمني" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-language">اللغة الافتراضية</Label>
                <Input id="platform-language" defaultValue="العربية" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform-timezone">المنطقة الزمنية</Label>
                <Input id="platform-timezone" defaultValue="GMT+3 (Arabia)" />
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-info/5 border border-info/20">
              <Database className="h-5 w-5 text-info" />
              <div className="text-xs">
                آخر نسخة احتياطية: <span className="font-semibold">29 أكتوبر 2025، 02:00</span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
