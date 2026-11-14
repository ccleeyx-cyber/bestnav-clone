import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { rows, one, json } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/session";
import { getStatusSummary } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const usage = rows<{
    model: string;
    n: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
  }>(
    `SELECT model, COUNT(*) AS n, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(cost_usd) AS cost_usd
     FROM relay_usage WHERE created_at >= ? GROUP BY model ORDER BY cost_usd DESC`,
    since,
  );

  const relays = rows<{ id: string; name: string; health_state: string; base_url: string }>(
    "SELECT id, name, health_state, base_url FROM relays ORDER BY priority ASC",
  );

  const tokens = rows<{ id: string; name: string; used_usd: number; budget_usd: number | null; enabled: number }>(
    "SELECT id, name, used_usd, budget_usd, enabled FROM relay_tokens ORDER BY created_at DESC",
  );

  const summary = await getStatusSummary();

  return ok({
    summary,
    usage,
    relays,
    tokens: tokens.map((t) => ({
      ...t,
      enabled: !!t.enabled,
      remaining: t.budget_usd != null ? Math.max(0, t.budget_usd - t.used_usd) : null,
    })),
  });
}
