import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import CalendarClient from "@/components/admin/CalendarClient";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const me = await currentUser();
  if (!me) redirect("/login");

  return (
    <AdminShell
      title="日历"
      description="本地事件可新建/编辑/删除；SSL 证书到期与备份记录由服务端自动汇入，不可手动删除"
    >
      <CalendarClient />
    </AdminShell>
  );
}
