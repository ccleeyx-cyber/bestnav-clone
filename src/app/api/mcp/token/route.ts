import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { verifyToken } from "@/lib/auth";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 生成 MCP 长连接令牌（管理员）。
 * 支持两种认证：Bearer 令牌 或 已登录的 Web 会话（cookie）。
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();

  const user = raw ? await verifyToken(raw) : await currentUser();
  if (!user) return fail("未登录或令牌无效", 401);
  if (user.role !== "owner" && user.role !== "admin") return fail("需要管理员权限", 403);

  const { issueMcpToken } = await import("@/lib/auth");
  const token = issueMcpToken(user.id);
  return NextResponse.json({
    ok: true,
    data: {
      token,
      endpoint: "/api/mcp",
      usage: `在 Claude / Cursor 的 MCP 配置中加入：\n{\n  "mcpServers": {\n    "bestnav": {\n      "url": "https://<你的域名>/api/mcp",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`,
    },
  });
}
