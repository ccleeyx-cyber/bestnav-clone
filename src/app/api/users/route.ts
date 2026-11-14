import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit, hashPassword } from "@/lib/auth";
import { now, one, rows, run, uid } from "@/lib/db";
import type { User } from "@/lib/types";
import { can, canDeleteUser, canManageUser, permissionsFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "用户名只允许字母数字与 _.-"),
  password: z.string().min(6).max(128),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  display_name: z.string().max(64).optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["owner", "admin", "member"]).optional(),
  enabled: z.boolean().optional(),
  display_name: z.string().max(64).optional(),
  password: z.string().min(6).max(128).optional(),
});

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

interface UserRow extends User {
  password_hash: string;
  updated_at: string;
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    display_name: u.display_name,
    enabled: u.enabled,
    created_at: u.created_at,
    permissions: permissionsFor(u.role),
  };
}

/** 统计仍处于启用状态的管理员数量（owner + admin），可排除某个用户。 */
function activeAdminCount(excludeId?: string): number {
  const row = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE role IN ('owner','admin') AND enabled = 1 AND id <> ?",
    excludeId ?? "",
  );
  return row?.n ?? 0;
}

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "users.manage")) return fail("需要管理员权限", 403);
  const list = rows<UserRow>("SELECT * FROM users ORDER BY created_at ASC");
  return ok({
    users: list.map(publicUser),
    myId: me.id,
    matrix: (["owner", "admin", "member"] as const).map((role) => ({
      role,
      permissions: permissionsFor(role),
    })),
  });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "users.manage")) return fail("需要管理员权限", 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { username, password, role, display_name } = parsed.data;

  if (role === "owner" && me.role !== "owner") {
    return fail("只有 owner 可以创建 owner 账号", 403);
  }

  const exists = one<{ id: string }>("SELECT id FROM users WHERE username = ?", username);
  if (exists) return fail("用户名已存在", 409);

  const id = uid("u_");
  const ts = now();
  run(
    "INSERT INTO users(id, username, password_hash, role, display_name, enabled, created_at, updated_at) VALUES(?,?,?,?,?,1,?,?)",
    id,
    username,
    hashPassword(password),
    role,
    display_name || username,
    ts,
    ts,
  );
  audit(me.id, "user.create", username, { id, role }, clientIp(req));

  const created = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
  return ok({ user: created ? publicUser(created) : null });
}

export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "users.manage")) return fail("需要管理员权限", 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { id, role, enabled, display_name, password } = parsed.data;

  const target = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
  if (!target) return fail("用户不存在", 404);

  if (!canManageUser(me, target)) {
    return fail(target.role === "owner" ? "owner 账号不可被修改" : "权限不足", 403);
  }
  if (role && role !== target.role) {
    if (role === "owner" && me.role !== "owner") {
      return fail("只有 owner 可以授予 owner 角色", 403);
    }
    const wasAdmin = target.role === "owner" || target.role === "admin";
    const willBeAdmin = role === "owner" || role === "admin";
    if (wasAdmin && !willBeAdmin && activeAdminCount(id) === 0) {
      return fail("系统必须至少保留一个启用的 owner/admin", 409);
    }
  }
  if (enabled === false) {
    const wasAdmin = target.role === "owner" || target.role === "admin";
    if (wasAdmin && activeAdminCount(id) === 0) {
      return fail("系统必须至少保留一个启用的 owner/admin，不能禁用最后一个", 409);
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (role !== undefined) {
    sets.push("role = ?");
    params.push(role);
  }
  if (enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(enabled ? 1 : 0);
  }
  if (display_name !== undefined) {
    sets.push("display_name = ?");
    params.push(display_name);
  }
  if (password) {
    sets.push("password_hash = ?");
    params.push(hashPassword(password));
  }
  if (!sets.length) return fail("没有可更新的字段");
  sets.push("updated_at = ?");
  params.push(now());
  params.push(id);
  run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...params);

  audit(
    me.id,
    "user.update",
    target.username,
    { id, role, enabled, display_name, passwordChanged: !!password },
    clientIp(req),
  );

  const updated = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
  return ok({ user: updated ? publicUser(updated) : null });
}

export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "users.manage")) return fail("需要管理员权限", 403);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少 id");

  const target = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
  if (!target) return fail("用户不存在", 404);

  if (target.role === "owner") {
    return fail("owner 账号不可被删除", 403);
  }
  if (!canDeleteUser(me, target)) return fail("权限不足", 403);

  if (target.role === "admin" && activeAdminCount(id) === 0) {
    return fail("系统必须至少保留一个启用的 owner/admin，不能删除最后一个", 409);
  }

  run("DELETE FROM sessions WHERE user_id = ?", id);
  run("DELETE FROM users WHERE id = ?", id);
  audit(me.id, "user.delete", target.username, { id, role: target.role }, clientIp(req));
  return ok({ deleted: id });
}
