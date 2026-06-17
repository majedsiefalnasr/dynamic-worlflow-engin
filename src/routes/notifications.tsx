import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Search,
  Trash2,
  Check,
  Undo2,
  Inbox,
  CheckCircle2,
  XCircle,
  Workflow,
  FileText,
  Filter,
} from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  notificationsCell,
  markAllRead,
  markNotifRead,
  deleteNotif,
  clearAllNotifs,
  type Notif,
} from "@/lib/governance";
import { useAuth } from "@/lib/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({ component: Notifications });

type Filter = "all" | "unread" | "read";

type Severity = "critical" | "warning" | "success" | "workflow" | "info";

function severityFor(n: Notif): Severity {
  const t = (n.title + " " + n.body).toLowerCase();
  if (t.includes("رفض") || t.includes("reject") || t.includes("مكرر") || t.includes("تنبيه"))
    return "critical";
  if (t.includes("إعادة") || t.includes("مُعاد") || t.includes("معاد") || t.includes("نقص"))
    return "warning";
  if (t.includes("اعتماد") || t.includes("approve") || t.includes("صدر") || t.includes("مكتمل"))
    return "success";
  if (t.includes("سير العمل") || t.includes("مرحلة") || t.includes("إجراء")) return "workflow";
  return "info";
}

const SEVERITY_STYLES: Record<
  Severity,
  {
    icon: typeof Bell;
    iconWrap: string;
    panel: string;
    unreadBg: string;
    badge: string;
    dot: string;
  }
> = {
  critical: {
    icon: XCircle,
    iconWrap: "text-rose-700 bg-rose-50 ring-1 ring-rose-200/80",
    panel: "ring-1 ring-inset ring-rose-200/70",
    unreadBg: "bg-rose-50/45",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/80",
    dot: "bg-rose-500",
  },
  warning: {
    icon: FileText,
    iconWrap: "text-amber-700 bg-amber-50 ring-1 ring-amber-200/80",
    panel: "ring-1 ring-inset ring-amber-200/70",
    unreadBg: "bg-amber-50/40",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80",
    dot: "bg-amber-500",
  },
  success: {
    icon: CheckCircle2,
    iconWrap: "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200/80",
    panel: "ring-1 ring-inset ring-emerald-200/70",
    unreadBg: "bg-emerald-50/40",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80",
    dot: "bg-emerald-500",
  },
  workflow: {
    icon: Workflow,
    iconWrap: "text-violet-700 bg-violet-50 ring-1 ring-violet-200/80",
    panel: "ring-1 ring-inset ring-violet-200/70",
    unreadBg: "bg-violet-50/40",
    badge: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/80",
    dot: "bg-violet-500",
  },
  info: {
    icon: Bell,
    iconWrap: "text-sky-700 bg-sky-50 ring-1 ring-sky-200/80",
    panel: "ring-1 ring-inset ring-sky-200/70",
    unreadBg: "bg-sky-50/35",
    badge: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/80",
    dot: "bg-sky-500",
  },
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "عاجل",
  warning: "مهم",
  success: "إنجاز",
  workflow: "سير عمل",
  info: "إشعار",
};

function bucketLabel(time: string) {
  if (time === "الآن") return "اليوم";
  if (time.includes("دقيق") || time.includes("ساع")) return "اليوم";
  if (time.includes("أمس")) return "أمس";
  if (time.includes("يوم")) return "هذا الأسبوع";
  return "أقدم";
}

function Notifications() {
  const items = notificationsCell.use();
  const auth = useAuth();
  const role = auth?.user?.role;

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [scopeMine, setScopeMine] = useState(false);

  const filtered = useMemo(() => {
    let xs = items;
    if (scopeMine && role) {
      xs = xs.filter(
        (n) =>
          !n.audience ||
          n.audience === "all" ||
          n.audience === role ||
          (n.audience === "cby" &&
            ["platform_admin", "support_member", "executive_member"].includes(role)),
      );
    }
    if (filter === "unread") xs = xs.filter((n) => n.unread);
    if (filter === "read") xs = xs.filter((n) => !n.unread);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      xs = xs.filter((n) => (n.title + " " + n.body).toLowerCase().includes(q));
    }
    return xs;
  }, [items, filter, query, scopeMine, role]);

  const unread = items.filter((n) => n.unread).length;

  const groups = useMemo(() => {
    const m = new Map<string, Notif[]>();
    for (const n of filtered) {
      const k = bucketLabel(n.time);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="مركز الإشعارات"
        subtitle={`${unread} غير مقروء من ${items.length} إجمالاً`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={unread === 0}>
              <CheckCheck className="h-4 w-4 ml-1" /> تحديد الكل كمقروء
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("حذف جميع الإشعارات؟")) clearAllNotifs();
              }}
              disabled={items.length === 0}
            >
              <Trash2 className="h-4 w-4 ml-1" /> مسح الكل
            </Button>
          </div>
        }
      />

      <Card className="shadow-card border-0 p-3 mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث في الإشعارات..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-9"
            />
          </div>
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            className="w-full md:w-auto"
          >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 md:w-auto">
              <TabsTrigger value="all" className="min-h-11 flex-1 md:flex-none">
                الكل ({items.length})
              </TabsTrigger>
              <TabsTrigger value="unread" className="min-h-11 flex-1 md:flex-none">
                غير مقروء ({unread})
              </TabsTrigger>
              <TabsTrigger value="read" className="min-h-11 flex-1 md:flex-none">
                مقروء ({items.length - unread})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {role && (
            <Button
              variant={scopeMine ? "default" : "outline"}
              size="sm"
              onClick={() => setScopeMine((v) => !v)}
              title="عرض ما يخصني فقط"
            >
              <Filter className="h-4 w-4 ml-1" />
              {scopeMine ? "ما يخصني" : "كل الجمهور"}
            </Button>
          )}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <div className="p-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <div className="mt-3 text-sm text-muted-foreground">
              {items.length === 0 ? "لا توجد إشعارات بعد." : "لا توجد إشعارات تطابق هذا الفلتر."}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([label, xs]) => (
            <div key={label}>
              <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">{label}</div>
              <Card className="shadow-card border-0 divide-y overflow-hidden">
                {xs.map((n) => {
                  const sev = severityFor(n);
                  const s = SEVERITY_STYLES[sev];
                  const Icon = s.icon;
                  const Body = (
                    <div
                      className={cn(
                        "p-4 flex gap-3 transition-colors hover:bg-muted/40",
                        s.panel,
                        n.unread && s.unreadBg,
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full grid place-items-center shrink-0",
                          s.iconWrap,
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                          <span className="truncate">{n.title}</span>
                          <span
                            className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", s.badge)}
                          >
                            {SEVERITY_LABEL[sev]}
                          </span>
                          {n.unread && (
                            <span
                              className={cn("h-2 w-2 rounded-full inline-block", s.dot)}
                              aria-label="unread"
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{n.time}</div>
                      </div>
                      <div
                        className="flex items-start gap-1 shrink-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          title={n.unread ? "تحديد كمقروء" : "تحديد كغير مقروء"}
                          onClick={() => markNotifRead(n.id, !n.unread)}
                        >
                          {n.unread ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-rose-600 hover:text-rose-700"
                          title="حذف"
                          onClick={() => deleteNotif(n.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                  return n.href ? (
                    <Link
                      key={n.id}
                      to={n.href}
                      onClick={() => n.unread && markNotifRead(n.id, false)}
                      className="block"
                    >
                      {Body}
                    </Link>
                  ) : (
                    <div key={n.id}>{Body}</div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
