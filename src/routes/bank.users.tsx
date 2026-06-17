import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Users as UsersIcon, Edit, Search, Power, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_USERS, ROLE_LABELS, useAuth, ENTITIES, BANK_ROLES, type User, type Role } from "@/lib/mock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { logAudit } from "@/lib/governance";

export const Route = createFileRoute("/bank/users")({ component: BankUsers });

function BankUsers() {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");

  if (!user) return null;
  if (user.role !== "bank_admin") {
    return <div className="p-6 text-sm text-muted-foreground">هذه الصفحة مخصصة لمسؤول الجهة فقط.</div>;
  }
  const entity = ENTITIES.find((e) => e.id === user.entityId);
  const list = useMemo(() => {
    void version;
    const s = q.trim().toLowerCase();
    return DEMO_USERS.filter((u) => u.entityId === user.entityId)
      .filter((u) => roleFilter === "all" || u.role === roleFilter)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [version, q, roleFilter, user.entityId]);

  const stats = useMemo(() => {
    void version;
    const all = DEMO_USERS.filter((u) => u.entityId === user.entityId);
    return {
      total: all.length,
      active: all.filter((u) => u.active !== false).length,
      inactive: all.filter((u) => u.active === false).length,
    };
  }, [version, user.entityId]);

  function refresh() { setVersion((v) => v + 1); }

  function toggleActive(u: User) {
    const idx = DEMO_USERS.findIndex((x) => x.id === u.id);
    if (idx < 0) return;
    const next = u.active === false;
    DEMO_USERS[idx] = { ...DEMO_USERS[idx], active: next };
    logAudit({
      userId: user!.id, userName: user!.name, role: user!.role,
      action: next ? "تفعيل موظف" : "إلغاء تفعيل موظف",
      ref: u.email, notes: u.name,
    });
    toast.success(next ? `تم تفعيل ${u.name}` : `تم إلغاء تفعيل ${u.name}`);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="موظفو الجهة"
        subtitle={`إدارة موظفي ${entity?.name ?? ""} وتعيين الأدوار الفرعية`}
        breadcrumbs={[{ label: "الرئيسية", to: "/" }, { label: "موظفو الجهة" }]}
        actions={
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-1" /> موظف جديد</Button>
            </DialogTrigger>
            <UserDialog
              title="إضافة موظف للجهة"
              onSave={(payload) => {
                const u: User = {
                  id: `u${Date.now()}`,
                  ...payload,
                  entityId: user!.entityId,
                  org: entity?.name ?? "",
                  avatar: payload.name.split(" ").map((s) => s[0]).join("").slice(0, 2),
                  active: true,
                };
                DEMO_USERS.push(u);
                logAudit({ userId: user!.id, userName: user!.name, role: user!.role, action: "إضافة موظف للجهة", ref: u.email, notes: `${u.name} — ${ROLE_LABELS[u.role]}` });
                toast.success(`تمت إضافة ${u.name}`);
                refresh();
                setOpenAdd(false);
              }}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="إجمالي الموظفين" value={stats.total} icon={UsersIcon} tone="bg-primary/10 text-primary" />
        <StatCard label="نشط" value={stats.active} icon={ShieldCheck} tone="bg-success/10 text-success" />
        <StatCard label="غير نشط" value={stats.inactive} icon={Power} tone="bg-destructive/10 text-destructive" />
      </div>

      <Card className="p-4 mb-4 shadow-card border-0 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pr-10" placeholder="بحث بالاسم أو البريد..." />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            {BANK_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="shadow-card border-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-3">الموظف</th>
              <th className="px-4 py-3">البريد</th>
              <th className="px-4 py-3">الدور</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-hero text-white grid place-items-center text-xs font-bold">{u.avatar}</div>
                    <div>
                      <div className="font-medium">{u.name}</div>
                      {u.phone && <div className="text-[11px] text-muted-foreground">{u.phone}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">{u.email}</td>
                <td className="px-4 py-3"><Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge></td>
                <td className="px-4 py-3">
                  {u.active === false
                    ? <Badge className="bg-destructive/15 text-destructive border-0">غير نشط</Badge>
                    : <Badge className="bg-success/15 text-success border-0">نشط</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      <Edit className="h-3.5 w-3.5 ml-1" /> تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={u.active === false ? "text-success" : "text-destructive"}
                      onClick={() => toggleActive(u)}
                      disabled={u.id === user.id}
                      title={u.id === user.id ? "لا يمكنك تعطيل حسابك" : ""}
                    >
                      <Power className="h-3.5 w-3.5 ml-1" />
                      {u.active === false ? "تفعيل" : "إلغاء تفعيل"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد نتائج.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <UserDialog
            title="تعديل بيانات الموظف"
            initial={editing}
            onSave={(payload) => {
              const idx = DEMO_USERS.findIndex((x) => x.id === editing.id);
              if (idx >= 0) {
                DEMO_USERS[idx] = {
                  ...DEMO_USERS[idx],
                  ...payload,
                  avatar: payload.name.split(" ").map((s) => s[0]).join("").slice(0, 2),
                };
              }
              logAudit({ userId: user!.id, userName: user!.name, role: user!.role, action: "تعديل بيانات موظف", ref: editing.email, notes: payload.name });
              toast.success("تم حفظ التعديلات");
              refresh();
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <Card className="p-4 shadow-card border-0">
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

type UserPayload = { name: string; email: string; role: Role; phone?: string };

function UserDialog({ title, initial, onSave }: { title: string; initial?: User; onSave: (u: UserPayload) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "bank_intake");
  const valid = name.trim() && /\S+@\S+\.\S+/.test(email);

  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>الفصل بين الإدخال والمراجعة الداخلية مفروض تلقائياً على نفس الطلب.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><Label>الاسم *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>البريد الإلكتروني *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9677…" /></div>
        <div className="space-y-1.5">
          <Label>الدور الفرعي *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BANK_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => valid && onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role })} disabled={!valid}>
          {initial ? "حفظ التعديلات" : "إضافة الموظف"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
