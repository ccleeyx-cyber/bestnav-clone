import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import VisitorsClient from "@/components/admin/VisitorsClient";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!can(me, "monitoring.manage") && !can(me, "users.manage")) redirect("/");

  return (
    <AdminShell
      title="访客统计"
      description="数据来自 visitor_stats 表；仅存 IP 的 sha256，不存原始 IP；无数据即显示空态"
    >
      <VisitorsClient />
    </AdminShell>
  );
}
