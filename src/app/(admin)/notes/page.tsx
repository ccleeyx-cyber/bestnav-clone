import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import NotesClient from "@/components/admin/NotesClient";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const me = await currentUser();
  if (!me) redirect("/login");

  return (
    <AdminShell title="记事本" description="分栏概览：全部 / 重要 / 未归类 / 近 7 天编辑 / 未完成待办">
      <NotesClient />
    </AdminShell>
  );
}
