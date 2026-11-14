import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { currentUser, isAdmin } from "./session";
import type { User } from "./types";

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ ok: false, error: message, ...(extra ? { extra } : {}) }, { status });
}

export async function requireUser(): Promise<User | NextResponse> {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  return u;
}

export async function requireAdmin(): Promise<User | NextResponse> {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  return u;
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail("参数校验失败", 422, parsed.error.flatten());
  }
  return parsed.data;
}

export function zodFail(e: ZodError) {
  return fail("参数校验失败", 422, e.flatten());
}
