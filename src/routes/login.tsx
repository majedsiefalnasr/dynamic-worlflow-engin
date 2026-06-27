import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Lock, ShieldCheck, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { auth, DEMO_USERS } from "@/lib/mock";
import { syncWorkflowUser } from "@/lib/workflow-bridge";
import { cn } from "@/lib/utils";
import { login as authLogin, isLive } from "@/lib/data/auth";
import { isDomainError } from "@/lib/data/errors";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const live = isLive();
  const [step, setStep] = useState<"login" | "otp">("login");
  const [selectedUserId, setSelectedUserId] = useState<number>(DEMO_USERS[0].id);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("otp");
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((u) => u.id === selectedUserId)!;
    auth.login(u);
    syncWorkflowUser(u);
    nav({ to: "/" });
  };

  const handleOtpLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      await authLogin(email, password);
      nav({ to: "/" });
    } catch (err) {
      toast.error(isDomainError(err) ? err.message : "فشل تسجيل الدخول");
      setStep("login");
    } finally {
      setIsPending(false);
    }
  };

  const selected = DEMO_USERS.find((u) => u.id === selectedUserId)!;

  return (
    <div
      dir="rtl"
      className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(32rem,0.9fr)]"
    >
      <div className="hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 text-lg font-semibold">
              ب.م
            </div>
            <div>
              <div className="font-semibold">اللجنة الوطنية لتمويل الواردات</div>
              <div className="text-sm text-white/70">منصة تمويل الواردات</div>
            </div>
          </div>
        </div>
        <div className="max-w-xl space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">
            مراجعة طلبات تمويل الواردات ضمن مسار واضح
          </h1>
          <p className="max-w-[58ch] text-base leading-7 text-white/80 text-pretty">
            إدارة الطلبات ومراجعتها واعتمادها وفق صلاحيات كل مستخدم والمراحل المعتمدة في سير العمل.
          </p>
        </div>
        <div className="text-sm text-white/65">وصول مؤسسي مع مصادقة متعددة العوامل</div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:p-12">
        <div className="w-full max-w-md">
          {step === "login" ? (
            live ? (
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">تسجيل الدخول</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    أدخل بيانات الحساب المؤسسي، ثم أكمل التحقق بخطوتين.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-email">البريد الإلكتروني المؤسسي</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">كلمة المرور</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full h-11 text-base">
                  متابعة إلى التحقق <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>

                <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  مصادقة متعددة العوامل (MFA) مفعّلة
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">تسجيل الدخول</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    أدخل بيانات الحساب المؤسسي، ثم أكمل التحقق بخطوتين.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-email">البريد الإلكتروني المؤسسي</Label>
                  <Input
                    id="login-email"
                    type="email"
                    defaultValue={selected.email}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">كلمة المرور</Label>
                  <Input
                    id="login-password"
                    type="password"
                    defaultValue="••••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label>الحساب التجريبي</Label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      اختر الحساب الذي تريد اختبار صلاحياته في هذه النسخة.
                    </p>
                  </div>
                  <div className="grid gap-1.5 max-h-72 overflow-y-auto pr-1">
                    {DEMO_USERS.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right text-xs transition-colors",
                          "min-h-11",
                          selectedUserId === u.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/40 hover:bg-muted/50",
                        )}
                      >
                        <div className="text-right min-w-0">
                          <div className="font-semibold truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.organization?.name ?? "—"}
                          </div>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-muted text-xs">
                          {u.roleLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 text-base">
                  متابعة إلى التحقق <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>

                <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  مصادقة متعددة العوامل (MFA) مفعّلة
                </div>
              </form>
            )
          ) : live ? (
            <form onSubmit={handleOtpLive} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold">رمز التحقق</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  أدخل الرمز المرسل إلى هاتفك المنتهي بـ ••42
                </p>
              </div>
              <div className="flex gap-2 justify-center" dir="ltr">
                {[2, 4, 8, 1, 9, 6].map((d, i) => (
                  <input
                    key={i}
                    aria-label={`رقم التحقق ${i + 1}`}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : undefined}
                    defaultValue={d}
                    maxLength={1}
                    className="h-14 w-12 rounded-lg border text-center text-xl font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                ))}
              </div>
              <Card className="border bg-muted/40 p-4 shadow-none">
                <div className="flex items-start gap-3">
                  <Lock className="h-4 w-4 mt-0.5 text-accent" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    جارٍ التحقق من بيانات الدخول، يرجى الانتظار.
                  </div>
                </div>
              </Card>
              <Button type="submit" className="w-full h-11 text-base" disabled={isPending}>
                تسجيل الدخول <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
              <button
                type="button"
                onClick={() => setStep("login")}
                className="mx-auto block min-h-11 rounded-md px-4 text-xs text-muted-foreground hover:text-foreground"
              >
                العودة إلى بيانات الدخول
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtp} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold">رمز التحقق</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  أدخل الرمز المرسل إلى هاتفك المنتهي بـ ••42
                </p>
              </div>
              <div className="flex gap-2 justify-center" dir="ltr">
                {[2, 4, 8, 1, 9, 6].map((d, i) => (
                  <input
                    key={i}
                    aria-label={`رقم التحقق ${i + 1}`}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : undefined}
                    defaultValue={d}
                    maxLength={1}
                    className="h-14 w-12 rounded-lg border text-center text-xl font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                ))}
              </div>
              <Card className="border bg-muted/40 p-4 shadow-none">
                <div className="flex items-start gap-3">
                  <Lock className="h-4 w-4 mt-0.5 text-accent" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    سيتم تسجيل دخولك بصلاحيات:{" "}
                    <span className="font-semibold text-foreground">{selected.roleLabel}</span>
                  </div>
                </div>
              </Card>
              <Button type="submit" className="w-full h-11 text-base">
                تسجيل الدخول <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
              <button
                type="button"
                onClick={() => setStep("login")}
                className="mx-auto block min-h-11 rounded-md px-4 text-xs text-muted-foreground hover:text-foreground"
              >
                العودة إلى بيانات الدخول
              </button>
            </form>
          )}

          <div className="mt-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            اللجنة الوطنية لتمويل الواردات · منصة الواردات v3.0
          </div>
        </div>
      </div>
    </div>
  );
}
