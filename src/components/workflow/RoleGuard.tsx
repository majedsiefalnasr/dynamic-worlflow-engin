import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth, type Role } from "@/lib/mock";
import type { ReactNode } from "react";

export function RoleGuard({
  allow,
  children,
  message = "هذه الصفحة غير متاحة لدورك التشغيلي.",
}: {
  allow: Role[];
  children: ReactNode;
  message?: string;
}) {
  const { user } = useAuth();
  if (!user) return null;
  if (!allow.includes(user.role)) {
    return (
      <div className="p-6">
        <Card className="p-8 shadow-card border-0 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl grid place-items-center bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-semibold mb-1">غير مصرّح بالوصول</div>
            <div className="text-sm text-muted-foreground">{message}</div>
          </div>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
