import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import AuditClient from "@/components/admin/AuditClient";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!can(me, "audit.viewAll") && !can(me, "audit.viewOwn")) redirect("/");

  return (
    <AdminShell
      title="审计日志"
      description="权限变更、登录、授权动作均入册；member 只能查看自己的记录"
    >
      <AuditClient canPurge={can(me, "audit.purge")} scope={can(me, "audit.viewAll") ? "all" : "own"} />
    </AdminShell>
  );
}
