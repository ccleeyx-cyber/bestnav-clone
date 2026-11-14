import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { authenticate } from "@/lib/tools-auth";
import { TOOL_ENGINES, listEngines, TOOL_CATEGORIES, getEngine } from "@/lib/toolbox";
import type { ToolResult } from "@/lib/toolbox";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({
      categories: TOOL_CATEGORIES,
      engines: listEngines(),
      count: TOOL_ENGINES.length,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(req: Request) {
  let body: { engine?: unknown; tool?: unknown; input?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const engineName =
    typeof body.engine === "string" && body.engine
      ? body.engine
      : typeof body.tool === "string"
        ? body.tool
        : "";
  if (!engineName) return fail("缺少 engine", 422);

  const auth = await authenticate(req, engineName);
  if (auth instanceof NextResponse) return auth;

  const engine = getEngine(engineName);
  if (!engine) return fail(`未知引擎「${engineName}」`, 404);

  const input = (body.input && typeof body.input === "object" ? body.input : {}) as Record<string, unknown>;

  let result: ToolResult;
  try {
    result = await engine.run(input);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "引擎执行失败" }, { status: 400 });
  }
  return ok({
    engine: engineName,
    output: result.output,
    mime: result.mime,
    filename: result.filename,
  });
}
