import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { one, rows } from "@/lib/db";
import { hashKey } from "@/lib/crypto";
import { json } from "@/lib/db";
import { getStatusSummary } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 开放 API 网关：X-API-Key 鉴权。
 * 每把 Key 可限定工具范围、来源 IP 与频次配额。
 */
export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  allowed_tools: string;
  allowed_ips: string;
  rate_limit: number;
  enabled: number;
  created_at: string;
}

const rateState = new Map<string, { count: number; resetAt: number }>();

export function checkApiKey(raw: string, ip: string, tool: string): { ok: true; key: ApiKeyRow } | { ok: false; error: string; status: number } {
  if (!raw) return { ok: false, error: "缺少 X-API-Key", status: 401 };
  const key = one<ApiKeyRow>("SELECT * FROM api_keys WHERE key_hash = ?", hashKey(raw));
  if (!key) return { ok: false, error: "API Key 无效", status: 401 };
  if (!key.enabled) return { ok: false, error: "API Key 已停用", status: 403 };

  const ips = json<string[]>(key.allowed_ips, []);
  if (ips.length > 0 && ip && !ips.includes(ip)) {
    return { ok: false, error: "来源 IP 不在允许列表", status: 403 };
  }

  const tools = json<string[]>(key.allowed_tools, []);
  if (tools.length > 0 && !tools.includes(tool) && !tools.includes("*")) {
    return { ok: false, error: `该 Key 无权调用 ${tool}`, status: 403 };
  }

  if (key.rate_limit > 0) {
    const now = Date.now();
    const st = rateState.get(key.id);
    if (!st || st.resetAt <= now) {
      rateState.set(key.id, { count: 1, resetAt: now + 60_000 });
    } else {
      st.count += 1;
      if (st.count > key.rate_limit) {
        return { ok: false, error: `超出频次配额（${key.rate_limit}/分钟）`, status: 429 };
      }
    }
  }
  return { ok: true, key };
}

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const raw = req.headers.get("x-api-key") ?? "";
  const chk = checkApiKey(raw, ip, "*");
  if (!chk.ok) return fail(chk.error, chk.status);
  return NextResponse.json({ ok: true, data: await getStatusSummary() });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const raw = req.headers.get("x-api-key") ?? "";
  const body = await req.json().catch(() => null);
  const tool = String(body?.tool ?? "");
  const chk = checkApiKey(raw, ip, tool);
  if (!chk.ok) return fail(chk.error, chk.status);

  const registry = await import("./toolbox/registry").catch(() => null);
  const engine = registry?.TOOL_ENGINES.find((e) => e.name === tool);
  if (!engine) return fail(`未知工具：${tool}`, 404);
  const result = await engine.run((body?.input ?? {}) as Record<string, unknown>);
  return NextResponse.json({ ok: true, data: result });
}

export function listApiKeys() {
  return rows<ApiKeyRow>("SELECT * FROM api_keys ORDER BY created_at DESC");
}
