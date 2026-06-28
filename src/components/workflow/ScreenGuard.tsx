import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/mock";
import { screenPermsCell, type ScreenKey } from "@/lib/governance";
import { canScreen } from "@/lib/workflow-bridge";
import { wfStore } from "@/lib/workflow-engine";
import { hasApiBase } from "@/lib/data/source";
import type { ReactNode } from "react";

export function ScreenGuard({
  screen,
  children,
  message = "هذه الشاشة غير متاحة لدورك وفق صلاحيات ظهور الشاشات.",
}: {
  screen: ScreenKey;
  children: ReactNode;
  message?: string;
}) {
  const { user } = useAuth();
  const live = hasApiBase();

  // Always call cell hooks to keep hook order stable (React rules).
  screenPermsCell.use();
  wfStore.assignments.use();
  wfStore.versions.use();
  if (!user) return null;
  wfStore.users.use();

  // TODO(deferred): remove rc_platform_admin bypass once backend populates
  // screen_permissions for admin users (currently returns empty array).
  // See docs/deferred/screen-permissions-bypass.md
  const allowed =
    user.roleId === "rc_platform_admin" ||
    (live
      ? (user.screenPermissions?.some((sp) => sp.screen === screen) ?? false)
      : canScreen(user, screen, "view"));

  if (!allowed) {
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
