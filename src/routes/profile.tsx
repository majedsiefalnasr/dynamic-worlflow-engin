import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Mail, Building2, Shield, Activity, Phone, BadgeCheck, KeyRound, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/mock";
import { auditCell } from "@/lib/governance";
import { wfStore } from "@/lib/workflow-engine";
import { dashboardBuckets, visibleInstancesFor } from "@/lib/workflow-bridge";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const { user } = useAuth();
  const instances = wfStore.instances.use();
  const audits = auditCell.use();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  const stats = useMemo(() => {
    if (!user) return [];
    const scoped = visibleInstancesFor(user, instances);
    const { total, active, closed } = dashboardBuckets(scoped);
    return [
      { l: "ضمن نطاقي", v: total },
      { l: "قيد المعالجة", v: active },
      { l: "مغلق", v: closed },
    ];
  }, [user, instances]);

  const myActivity = useMemo(
    () => audits.filter((a) => a.userId === String(user?.id)).slice(0, 6),
    [audits, user],
  );

  if (!user) return null;

  return (
    <div>
      <PageHeader
        title="الملف الشخصي"
        subtitle="معلومات الحساب وإعدادات الأمان"
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "الملف الشخصي" }]}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 shadow-card border-0 text-center">
          <div className="h-24 w-24 rounded-full bg-primary text-primary-foreground grid place-items-center text-3xl font-bold mx-auto">
            {user.avatar}
          </div>
          <div className="mt-4 font-bold text-lg flex items-center justify-center gap-1.5">
            {user.name}
            <BadgeCheck className="h-4 w-4 text-accent" />
          </div>
          <Badge variant="secondary" className="mt-1">
            {user.roleLabel}
          </Badge>
          <div className="text-xs text-muted-foreground mt-2">{user.organization?.name ?? "—"}</div>

          <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t">
            {stats.map((s) => (
              <div key={s.l}>
                <div className="font-bold tabular-nums">{s.v}</div>
                <div className="text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t space-y-2 text-right">
            <InfoRow icon={Mail} v={user.email} />
            {phone && <InfoRow icon={Phone} v={phone} />}
            <InfoRow icon={Building2} v={user.organization?.name ?? "—"} />
          </div>
        </Card>

        <Card className="p-6 shadow-card border-0 lg:col-span-2 space-y-5">
          <div>
            <h3 className="font-semibold">المعلومات الأساسية</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              حدّث بياناتك الشخصية وطرق التواصل
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9677…"
              />
            </div>
            <div className="space-y-2">
              <Label>الجهة</Label>
              <Input value={user.organization?.name ?? "—"} disabled />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Input value={user.roleLabel} disabled />
            </div>
            <div className="space-y-2">
              <Label>المعرّف</Label>
              <Input value={String(user.id)} disabled className="font-mono text-xs" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Button
              onClick={() => {
                user.name = name;
                user.email = email;
                user.phone = phone;
                toast.success("تم حفظ التغييرات");
              }}
            >
              <Save className="h-4 w-4 ml-1" /> حفظ التغييرات
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.info("سيتم إرسال رابط إعادة التعيين إلى بريدك")}
            >
              <KeyRound className="h-4 w-4 ml-1" /> تغيير كلمة المرور
            </Button>
            <Button
              variant="ghost"
              onClick={() => toast.info("تم إرسال طلب تفعيل المصادقة الثنائية")}
            >
              <Shield className="h-4 w-4 ml-1" /> المصادقة الثنائية
            </Button>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" /> آخر نشاطي
            </h3>
            {myActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                لا يوجد نشاط مسجل بعد.
              </div>
            ) : (
              <div className="space-y-1.5">
                {myActivity.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40"
                  >
                    <div className="h-8 w-8 rounded-lg bg-muted grid place-items-center">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{a.action}</div>
                      {a.ref && (
                        <div className="text-xs text-muted-foreground font-mono">{a.ref}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.ts).toLocaleString("ar-EG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  v,
}: {
  icon: React.ComponentType<{ className?: string }>;
  v: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{v}</span>
    </div>
  );
}
