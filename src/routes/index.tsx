import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Clock, FilePlus2, FileText, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth, ROLE_LABELS } from "@/lib/mock";
import { wfStore } from "@/lib/workflow-engine";
import {
  dashboardBuckets,
  instanceAmount,
  instanceCurrency,
  instanceRef,
  instanceTitle,
  progressForInstance,
  roleCanCreateRequest,
  stageLabel,
  visibleInstancesFor,
} from "@/lib/workflow-bridge";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();
  const instances = wfStore.instances.use();
  wfStore.stages.use();
  if (!user) return null;

  const scoped = visibleInstancesFor(user, instances);
  const stats = dashboardBuckets(scoped);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلاً، ${user.name.split(" ")[0]}`}
        subtitle={`لوحة ${ROLE_LABELS[user.roleId] ?? user.roleId} — تعمل الآن بالكامل من محرّك سير العمل`}
        actions={
          roleCanCreateRequest(user) ? (
            <Button asChild>
              <Link to="/workflows">
                <FilePlus2 className="h-4 w-4 ml-1" /> طلب جديد
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="ضمن نطاقي"
          value={stats.total}
          icon={FileText}
          tone="text-primary bg-primary/10"
        />
        <Kpi
          label="قيد المعالجة"
          value={stats.active}
          icon={Clock}
          tone="text-warning bg-warning/10"
        />
        <Kpi
          label="مغلقة"
          value={stats.closed}
          icon={CheckCircle2}
          tone="text-success bg-success/10"
        />
        <Kpi
          label="مرفوضة"
          value={stats.rejected}
          icon={XCircle}
          tone="text-destructive bg-destructive/10"
        />
      </div>

      <Card className="p-5 shadow-card border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">أحدث طلبات سير العمل</h3>
            <p className="text-xs text-muted-foreground">
              البيانات معروضة من instances المحرّك، وليس من الطلبات القديمة.
            </p>
          </div>
          <Link
            to="/workflows"
            className="flex min-h-11 items-center gap-1 rounded-md px-3 text-xs text-accent hover:underline"
          >
            عرض الكل <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {scoped.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            لا توجد طلبات ضمن نطاق هذا المستخدم.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr className="text-right">
                  <th className="py-2.5">المرجع</th>
                  <th className="py-2.5">مقدم الطلب</th>
                  <th className="py-2.5">المبلغ</th>
                  <th className="py-2.5">المرحلة</th>
                  <th className="py-2.5">التقدم</th>
                  <th className="py-2.5 text-left">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {scoped.slice(0, 8).map((inst) => (
                  <tr key={inst.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-3 font-mono text-xs text-accent">{instanceRef(inst)}</td>
                    <td className="py-3">{instanceTitle(inst)}</td>
                    <td className="py-3 font-semibold tabular-nums">
                      {instanceAmount(inst).toLocaleString("en-US")}
                      <span className="text-xs text-muted-foreground mr-1">
                        {instanceCurrency(inst)}
                      </span>
                    </td>
                    <td className="py-3">
                      <Badge variant="secondary">{stageLabel(inst)}</Badge>
                    </td>
                    <td className="py-3 w-36">
                      <Progress value={progressForInstance(inst)} className="h-1.5" />
                      <div className="text-xs text-muted-foreground mt-1">
                        {progressForInstance(inst)}%
                      </div>
                    </td>
                    <td className="py-3 text-left">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/workflows/instances/$id" params={{ id: inst.id }}>
                          فتح
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <Card className="p-5 shadow-card border-0">
      <div className={`h-10 w-10 rounded-xl grid place-items-center ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold tracking-tight">{value.toLocaleString("en-US")}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
