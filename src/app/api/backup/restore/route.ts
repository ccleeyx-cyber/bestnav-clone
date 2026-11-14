import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listBackups, restoreFromZip } from "@/lib/backup";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

const Schema = z.object({
  path: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
});

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "backup.manage")) return fail("需要管理员权限", 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { path, fileId } = parsed.data;

  let target = path;
  if (!target && fileId) {
    const row = one<{ path: string }>("SELECT path FROM backups WHERE id = ?", fileId);
    if (!row) return fail("备份记录不存在", 404);
    target = row.path;
  }
  if (!target) return fail("缺少 path 或 fileId");

  try {
    const result = restoreFromZip(target);
    audit(me.id, "backup.restore", target, { tables: result.tables }, clientIp(req));
    return ok({ restored: result.tables });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "恢复失败";
    audit(me.id, "backup.restore_failed", target, { error: msg }, clientIp(req));
    return fail(msg, 500);
  }
}

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "backup.manage")) return fail("需要管理员权限", 403);
  return ok({ backups: listBackups() });
}
