import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, getUserByUsername, issueToken, verifyPassword, countUsers, audit, hasAdmin } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { fail, ok } from "@/lib/api";

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return fail("用户名或密码格式不正确");
  const { username, password } = parsed.data;

  const user = getUserByUsername(username);
  if (!user || !user.enabled || !verifyPassword(password, user.password_hash)) {
    return fail("用户名或密码错误", 401);
  }
  const token = await issueToken(user.id, req.headers.get("user-agent") ?? "");
  audit(user.id, "login", username, {}, req.headers.get("x-forwarded-for") ?? "");
  const res = ok({
    id: user.id,
    username: user.username,
    role: user.role,
    display_name: user.display_name,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return res;
}

const RegisterSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6),
  display_name: z.string().max(64).optional(),
});

export async function PUT(req: Request) {
  if (hasAdmin()) return fail("管理员已存在，请使用账号管理创建用户");
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  if (countUsers() > 0) return fail("初始化已完成");
  const u = createUser(parsed.data.username, parsed.data.password, "owner", parsed.data.display_name ?? "");
  const token = await issueToken(u.id);
  const res = ok({ id: u.id, username: u.username, role: u.role });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
  return res;
}
