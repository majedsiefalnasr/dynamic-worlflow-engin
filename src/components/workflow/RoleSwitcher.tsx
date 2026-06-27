import { UserCog } from "lucide-react";
import { auth, useAuth, DEMO_USERS } from "@/lib/mock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { syncWorkflowUser } from "@/lib/workflow-bridge";
import { hasApiBase } from "@/lib/data/source";

export function RoleSwitcher() {
  const { user } = useAuth();
  if (!user || hasApiBase()) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="تبديل الدور (عرض توضيحي)">
          <UserCog className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>تبديل الدور — عرض توضيحي</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DEMO_USERS.map((u) => (
          <DropdownMenuItem
            key={u.id}
            onSelect={() => {
              auth.login(u);
              syncWorkflowUser(u);
            }}
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="min-w-0">
                <div className="text-sm truncate">{u.name}</div>
                <div className="text-[10.5px] text-muted-foreground truncate">{u.roleLabel}</div>
              </div>
              {user.id === u.id && <span className="text-xs text-success">نشط</span>}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
