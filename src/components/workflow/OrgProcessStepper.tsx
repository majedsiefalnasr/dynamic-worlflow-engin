import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canViewByStageRouting, getStagesForVersion, isAssigned, processLabelForStage,
  wfStore, type WorkflowInstance, type WorkflowStage,
} from "@/lib/workflow-engine";
import { useWfUser } from "@/lib/workflow-engine/wfAuth";
import { Badge } from "@/components/ui/badge";

export function OrgProcessStepper({ instance, apiStages }: { instance: WorkflowInstance; apiStages?: WorkflowStage[] }) {
  wfStore.stages.use();
  wfStore.stageRoutingRules.use();
  wfStore.assignments.use();
  const user = useWfUser();

  const allStages = apiStages ?? getStagesForVersion(instance.workflowVersionId);
  const currentIdx = allStages.findIndex((s) => s.id === instance.currentStageId);
  const rejected = instance.status === "rejected";
  const isAdmin = Boolean(user?.roleIds.includes("role_admin"));

  const visibleStages = apiStages
    ? allStages
    : allStages.filter((s) => {
        if (isAdmin) return true;
        return canViewByStageRouting(s.id, user);
      });

  if (visibleStages.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد مراحل مخصّصة لعرضها.</p>;
  }

  return (
    <ol className="relative space-y-4">
      {visibleStages.map((s, vi) => {
        const i = allStages.findIndex((x) => x.id === s.id);
        const isCurrent = i === currentIdx;
        const isDone = currentIdx >= 0 && i < currentIdx;
        const isPending = currentIdx >= 0 && i > currentIdx;
        const mine = apiStages ? false : isAssigned(s.id, user);
        const isLast = vi === visibleStages.length - 1;

        const statusLabel = isCurrent
          ? rejected ? "مرفوض" : "المرحلة الحالية"
          : isDone ? "مكتمل" : "بانتظار";

        return (
          <li key={s.id} className="relative flex gap-3">
            {/* connector + marker */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isCurrent && !rejected && "border-primary bg-primary/15 text-primary",
                  isCurrent && rejected && "border-destructive bg-destructive/15 text-destructive",
                  isPending && "border-muted-foreground/30 bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : isCurrent && rejected ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {!isLast && (
                <span className={cn("mt-1 w-0.5 flex-1 min-h-6", isDone ? "bg-primary" : "bg-muted")} />
              )}
            </div>

            {/* label */}
            <div className="pb-1 -mt-0.5">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", isCurrent ? "text-foreground" : "text-foreground/80")}>
                  {apiStages ? s.name : processLabelForStage(s, user)}
                </span>
                {mine && (
                  <Badge variant="outline" className="h-4 px-1.5 text-xs border-primary/40 text-primary">دورك</Badge>
                )}
              </div>
              <div
                className={cn(
                  "text-xs mt-0.5",
                  isCurrent && !rejected && "text-primary",
                  isCurrent && rejected && "text-destructive",
                  !isCurrent && "text-muted-foreground",
                )}
              >
                {statusLabel}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
