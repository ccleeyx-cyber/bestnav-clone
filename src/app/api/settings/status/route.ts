import { countUsers } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** 登录页/首页用：是否需要初始化 + 当前登录用户。 */
export async function GET() {
  const u = await currentUser();
  return ok({
    needsSetup: countUsers() === 0,
    user: u
      ? { id: u.id, username: u.username, role: u.role, display_name: u.display_name }
      : null,
  });
}
