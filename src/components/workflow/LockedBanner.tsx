import { Lock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LockedBanner({
  variant = "locked",
  message,
}: {
  variant?: "locked" | "readonly" | "pending";
  message?: string;
}) {
  const cfg = {
    locked: {
      icon: Lock,
      title: "هذا الطلب مغلق",
      defaultMsg: "لا يمكن تعديل البيانات أو حذف المستندات بعد إحالته للبنك المركزي.",
      cls: "bg-muted/60 border-border text-muted-foreground",
    },
    readonly: {
      icon: AlertCircle,
      title: "وضع العرض فقط",
      defaultMsg: "تستطيع الاطلاع على البيانات دون إجراء تعديلات.",
      cls: "bg-info/10 border-info/30 text-info",
    },
    pending: {
      icon: AlertCircle,
      title: "بانتظار إجراء",
      defaultMsg: "هذا الطلب بانتظار خطوة من جهة أخرى.",
      cls: "bg-warning/10 border-warning/30 text-warning",
    },
  }[variant];
  const Icon = cfg.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", cfg.cls)}>
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-semibold">{cfg.title}</div>
        <div className="opacity-80">{message ?? cfg.defaultMsg}</div>
      </div>
    </div>
  );
}
