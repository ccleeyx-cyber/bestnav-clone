import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import UsersClient from "@/components/admin/UsersClient";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!can(me, "users.manage")) redirect("/");

  return (
    <AdminShell title="用户与角色" description="多用户 RBAC：owner / admin / member">
      <UsersClient />
    </AdminShell>
  );
}
