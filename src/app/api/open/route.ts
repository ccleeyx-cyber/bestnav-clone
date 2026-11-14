import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { checkApiKey } from "@/lib/openapi";
import { getStatusSummary } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const registry = await import("@/lib/toolbox/registry").catch(() => null);
  const engine = registry?.TOOL_ENGINES.find((e) => e.name === tool);
  if (!engine) return fail(`未知工具：${tool}`, 404);
  const result = await engine.run((body?.input ?? {}) as Record<string, unknown>);
  return NextResponse.json({ ok: true, data: result });
}
