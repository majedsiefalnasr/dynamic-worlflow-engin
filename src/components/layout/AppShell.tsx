import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
  Bell,
  Search,
  Sun,
  Moon,
  LogOut,
  Languages,
  Building2,
  ScrollText,
  AlertTriangle,
  ChevronLeft,
  UserCog,
  Network,
  FileCheck2,
  KeyRound,
  ShieldCheck,
  Menu,
  X,
  Database,
} from "lucide-react";
import { useState } from "react";
import { useAuth, auth, ROLE_LABELS, type Role } from "@/lib/mock";
import { notificationsCell, markAllRead, screenPermsCell, type ScreenKey } from "@/lib/governance";
import { canScreen } from "@/lib/workflow-bridge";
import { wfStore } from "@/lib/workflow-engine";
import { RoleSwitcher } from "@/components/workflow/RoleSwitcher";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  screen?: ScreenKey;
};

const NAV: NavItem[] = [
  { to: "/", label: "اللوحة الرئيسية", icon: LayoutDashboard },
  { to: "/workflows", label: "الطلبات", icon: FileText, screen: "requests" },
  { to: "/merchants", label: "إدارة التجار", icon: Building2, screen: "merchants" },

  { to: "/reports", label: "التقارير والتحليلات", icon: BarChart3, screen: "reports" },
  { to: "/audit", label: "التدقيق والامتثال", icon: ScrollText, screen: "audit" },
  { to: "/notifications", label: "الإشعارات", icon: Bell },
  { to: "/admin/workflows", label: "مصمم سير العمل", icon: FileCheck2, roles: ["platform_admin"] },
  {
    to: "/admin/reference-data",
    label: "البيانات الأساسية",
    icon: Database,
    roles: ["platform_admin"],
  },
  {
    to: "/admin/screen-permissions",
    label: "صلاحيات الشاشات",
    icon: ShieldCheck,
    roles: ["platform_admin"],
  },
  { to: "/admin/entities", label: "إدارة البنوك", icon: Network, roles: ["platform_admin"] },
  { to: "/admin/orgs", label: "إدارة الجهات", icon: Building2, roles: ["platform_admin"] },
  { to: "/admin/cby-staff", label: "مستخدمي النظام", icon: UserCog, roles: ["platform_admin"] },
  { to: "/admin/teams", label: "إدارة الفرق", icon: Users, roles: ["platform_admin"] },
  { to: "/admin/roles", label: "إدارة الأدوار", icon: KeyRound, roles: ["platform_admin"] },
  { to: "/bank/users", label: "موظفو الجهة", icon: Users, roles: ["bank_admin"] },
  { to: "/settings", label: "إعدادات النظام", icon: Settings, roles: ["platform_admin"] },
];

export function AppShell() {
  const { user, theme } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) {
    return <Outlet />;
  }

  screenPermsCell.use();
  wfStore.assignments.use();
  wfStore.versions.use();
  wfStore.users.use();
  const items = NAV.filter((i) => {
    if (i.screen) return canScreen(user, i.screen, "view");
    if (i.roles) return i.roles.includes(user.role);
    return true;
  });
  const notifs = notificationsCell.use();
  const unread = notifs.filter((n) => n.unread).length;

  return (
    <div dir="rtl" className="flex min-h-screen w-full bg-background text-foreground">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 h-screen shrink-0 bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-transform duration-300",
          "lg:sticky lg:top-0 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
          collapsed ? "w-72 lg:w-20" : "w-72",
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-bold shrink-0">
            ب م
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-bold">منصة الواردات</div>
              <div className="text-[11px] text-sidebar-foreground/60">البنك المركزي اليمني</div>
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="ms-auto grid h-11 w-11 place-items-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-9rem)]">
          {items.map((it) => {
            const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <it.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{it.label}</span>}
                {!collapsed && active && <ChevronLeft className="h-4 w-4 ms-auto opacity-60" />}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 inset-x-0 p-3 border-t border-sidebar-border bg-sidebar hidden lg:block">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="min-h-11 w-full rounded-md py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            {collapsed ? "توسيع ›" : "‹ طي الشريط الجانبي"}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b bg-card/80 backdrop-blur-md flex items-center gap-2 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative w-full max-w-md hidden sm:block">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن طلب، تاجر، أو رقم فاتورة..."
              className="pr-10 bg-muted/50 border-transparent focus-visible:bg-card"
            />
          </div>

          <div className="ms-auto flex items-center gap-1.5 sm:gap-3">
            <RoleSwitcher />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => auth.setLang(auth.lang === "ar" ? "en" : "ar")}
              aria-label={
                auth.lang === "ar" ? "Switch language to English" : "تغيير اللغة إلى العربية"
              }
            >
              <Languages className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => auth.toggleTheme()}
              aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="فتح الإشعارات">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span
                      className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="font-semibold">الإشعارات</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{unread} جديد</Badge>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[11px] text-primary hover:underline"
                      >
                        قراءة الكل
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-96 overflow-auto divide-y">
                  {notifs.slice(0, 12).map((n) => (
                    <div key={n.id} className="p-4 hover:bg-muted/50 cursor-pointer flex gap-3">
                      <div
                        className={cn(
                          "mt-1 h-2 w-2 rounded-full shrink-0",
                          n.unread ? "bg-accent" : "bg-muted",
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{n.body}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t text-center">
                  <Link to="/notifications" className="text-xs text-primary hover:underline">
                    عرض كل الإشعارات
                  </Link>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-h-11 items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-muted/60"
                  aria-label="فتح قائمة المستخدم"
                >
                  <div className="text-right leading-tight hidden sm:block">
                    <div className="text-sm font-semibold">{user.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ROLE_LABELS[user.role]}
                    </div>
                  </div>
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {user.avatar}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                  <div className="text-xs font-normal text-muted-foreground mt-0.5">{user.org}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => nav({ to: "/profile" })}>
                  الملف الشخصي
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => nav({ to: "/settings" })}>
                  الإعدادات
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    auth.logout();
                    nav({ to: "/login" });
                  }}
                  className="text-destructive"
                >
                  <LogOut className="h-4 w-4 ml-2" /> تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="px-4 lg:px-6 py-4 text-xs text-muted-foreground border-t flex flex-col sm:flex-row items-center gap-2 sm:justify-between text-center">
          <div>© 2026 البنك المركزي اليمني — جميع الحقوق محفوظة</div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            بيئة عرض توضيحي (Prototype)
          </div>
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-1.5">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {b.to ? (
                <Link
                  to={b.to}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground"
                >
                  {b.label}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
