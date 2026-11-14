import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { verifyToken } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { visibleSwitches, performAction, RISK_LABELS } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP over HTTP（Streamable HTTP 的 JSON-RPC 子集）。
 * 客户端用 Authorization: Bearer <mcp-token> 认证，token 由设置页生成。
 */
function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

const TOOLS = [
  {
    name: "list_switches",
    description: "列出控制室的所有开关及其当前状态",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_status",
    description: "获取面板整体状态：容器数量、主机资源摘要、证书到期、当前用户",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_switch",
    description: "执行一个控制室开关（如启动/停止容器、立即备份）。可先 dryRun 预演",
    inputSchema: {
      type: "object",
      properties: {
        switchId: { type: "string" },
        dryRun: { type: "boolean" },
        params: { type: "object" },
      },
      required: ["switchId"],
      additionalProperties: false,
    },
  },
];

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  // 优先 Bearer 令牌（AI 客户端）；退化到 Web 会话（浏览器直接调试用）
  const user = raw ? await verifyToken(raw) : await currentUser();
  if (!user) return fail("缺少 Bearer 令牌", 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body ?? {};

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "bestnav-clone", version: "0.1.0" },
    });
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      if (name === "list_switches") {
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { switches: visibleSwitches(user), riskLabels: RISK_LABELS },
                null,
                2,
              ),
            },
          ],
        });
      }
      if (name === "run_switch") {
        const result = await performAction(user, String(args.switchId ?? ""), {
          dryRun: !!args.dryRun,
          params: args.params ?? {},
          source: "mcp",
        });
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: !result.ok,
        });
      }
      if (name === "get_status") {
        const { getStatusSummary } = await import("@/lib/status");
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(await getStatusSummary(), null, 2) }],
        });
      }
      return rpcError(id, -32601, `未知工具：${name}`);
    } catch (e) {
      return rpcResult(id, {
        content: [{ type: "text", text: `执行失败：${(e as Error).message}` }],
        isError: true,
      });
    }
  }
  if (method === "ping") return rpcResult(id, {});
  return rpcError(id, -32601, `未知方法：${method}`);
}

