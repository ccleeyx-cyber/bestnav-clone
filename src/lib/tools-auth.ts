import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { checkApiKey } from "@/lib/openapi";

export interface AuthContext {
  mode: "session" | "api-key";
  keyId?: string;
}

/**
 * 工具箱鉴权：
 * - 带 X-API-Key 头 → 走 checkApiKey（IP 白名单 / 工具范围 / 频次配额）
 * - 否则走会话登录
 * - 两者都无 → 401
 */
export async function authenticate(req: Request, tool: string): Promise<AuthContext | NextResponse> {
  const raw = req.headers.get("x-api-key");
  if (raw && raw.trim()) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const chk = checkApiKey(raw.trim(), ip, tool);
    if (!chk.ok) return fail(chk.error, chk.status);
    return { mode: "api-key", keyId: chk.key.id };
  }
  const user = await currentUser();
  if (!user) return fail("未登录：需要有效的 X-API-Key 或登录会话", 401);
  return { mode: "session" };
}
