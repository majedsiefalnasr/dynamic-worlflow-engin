import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Lock, ShieldCheck, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { auth, DEMO_USERS, ROLE_LABELS } from "@/lib/mock";
import { syncWfUserFromLegacy } from "@/lib/workflow-bridge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState<"login" | "otp">("login");
  const [selectedUserId, setSelectedUserId] = useState<string>(DEMO_USERS[0].id);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("otp");
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((u) => u.id === selectedUserId)!;
    auth.login(u);
    syncWfUserFromLegacy(u);
    nav({ to: "/" });
  };

  const selected = DEMO_USERS.find((u) => u.id === selectedUserId)!;

  return (
    <div dir="rtl" className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative bg-gradient-hero text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-2xl font-bold">
              ب.م
            </div>
            <div>
              <div className="font-bold text-lg">البنك المركزي اليمني</div>
              <div className="text-sm text-white/70">Central Bank of Yemen</div>
            </div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-balance">
            منصة إدارة ومراجعة طلبات تمويل الواردات
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            دورة عمل ديناميكية بالكامل: مصمم سير عمل يحدد المراحل، الحقول، الصلاحيات، والإجراءات بدون كود.
          </p>
        </div>
        <div className="relative text-xs text-white/50">
          محمي بأعلى معايير الأمن السيبراني · ISO 27001
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {step === "login" ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  أدخل بياناتك للوصول إلى منصة الواردات
                </p>
              </div>

              <div className="space-y-2">
                <Label>البريد الإلكتروني المؤسسي</Label>
                <Input type="email" defaultValue={selected.email} required />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input type="password" defaultValue="••••••••••" required />
              </div>

              <div className="space-y-2">
                <Label>اختر مستخدم العرض التوضيحي</Label>
                <div className="grid gap-1.5 max-h-72 overflow-y-auto pr-1">
                  {DEMO_USERS.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={cn(
                        "text-right px-3 py-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2",
                        selectedUserId === u.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40 hover:bg-muted/50",
                      )}
                    >
                      <div className="text-right min-w-0">
                        <div className="font-semibold truncate">{u.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{u.org}</div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-muted text-[10px]">{ROLE_LABELS[u.role]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full h-11 text-base">
                متابعة <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>

              <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                مصادقة متعددة العوامل (MFA) مفعّلة
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtp} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">رمز التحقق (OTP)</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  أدخل الرمز المرسل إلى هاتفك المنتهي بـ ••42
                </p>
              </div>
              <div className="flex gap-2 justify-center" dir="ltr">
                {[2, 4, 8, 1, 9, 6].map((d, i) => (
                  <input
                    key={i}
                    defaultValue={d}
                    maxLength={1}
                    className="h-14 w-12 rounded-lg border-2 text-center text-2xl font-bold focus:border-primary outline-none"
                  />
                ))}
              </div>
              <Card className="p-4 bg-muted/40 border-dashed">
                <div className="flex items-start gap-3">
                  <Lock className="h-4 w-4 mt-0.5 text-accent" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    سيتم تسجيل دخولك بصلاحيات: <span className="font-semibold text-foreground">{ROLE_LABELS[selected.role]}</span>
                  </div>
                </div>
              </Card>
              <Button type="submit" className="w-full h-11 text-base">
                تأكيد ودخول <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
              <button type="button" onClick={() => setStep("login")} className="block mx-auto text-xs text-muted-foreground hover:text-foreground">
                ← رجوع
              </button>
            </form>
          )}

          <div className="mt-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            البنك المركزي اليمني — منصة الواردات v3.0
          </div>
        </div>
      </div>
    </div>
  );
}
