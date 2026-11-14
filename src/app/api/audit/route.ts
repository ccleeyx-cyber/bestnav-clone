import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/auth";
import { rows, run } from "@/lib/db";
import { can } from "@/lib/rbac";
import type { AuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  const viewAll = can(me, "audit.viewAll");
  if (!viewAll && !can(me, "audit.viewOwn")) return fail("无权查看审计日志", 403);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { page, pageSize, action, userId, from, to, q } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];

  // member 只能看自己的
  if (!viewAll) {
    where.push("a.user_id = ?");
    params.push(me.id);
  } else if (userId) {
    where.push("a.user_id = ?");
    params.push(userId);
  }

  if (action) {
    where.push("a.action LIKE ?");
    params.push(`%${action}%`);
  }
  if (from) {
    where.push("a.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("a.created_at <= ?");
    params.push(to);
  }
  if (q) {
    where.push("(a.target LIKE ? OR a.detail LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total =
    rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_logs a ${whereSql}`,
      ...params,
    )[0]?.n ?? 0;

  const offset = (page - 1) * pageSize;
  const list = rows<AuditLog & { username: string | null }>(
    `SELECT a.*, u.username AS username
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${whereSql} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset,
  );

  return ok({
    logs: list.map((r) => ({ ...r, detail: safeJson(r.detail) })),
    total,
    page,
    pageSize,
    scope: viewAll ? "all" : "own",
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "audit.purge")) return fail("需要管理员权限", 403);

  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const before = rows<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE created_at < ?",
    cutoff,
  )[0]?.n ?? 0;

  run("DELETE FROM audit_logs WHERE created_at < ?", cutoff);
  audit(me.id, "audit.purge", "audit_logs", { removed: before, cutoff }, clientIp(req));

  return ok({ removed: before, cutoff });
}
