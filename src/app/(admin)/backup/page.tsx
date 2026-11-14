import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import BackupClient from "@/components/admin/BackupClient";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!can(me, "backup.manage")) redirect("/");

  return (
    <AdminShell title="备份与恢复" description="一键导出 zip、定时自动备份、WebDAV 异地备份">
      <BackupClient />
    </AdminShell>
  );
}
