import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { aggregateSearch, isCategory, CATEGORIES, type CategoryId } from "@/lib/aggregate-search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? "web";

  if (!isCategory(category)) {
    return fail(`未知分类「${category}」，可选：${CATEGORIES.map((c) => c.id).join(", ")}`, 400);
  }
  try {
    const result = await aggregateSearch(category as CategoryId, q);
    return ok(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

/** POST 与 GET 等价，方便前端流式发起。 */
export async function POST(req: Request) {
  let q = "";
  let category = "web";
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      const body = (await req.json()) as { q?: unknown; category?: unknown };
      if (typeof body.q === "string") q = body.q;
      if (typeof body.category === "string") category = body.category;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      q = params.get("q") ?? "";
      category = params.get("category") ?? "web";
    }
  } catch {
    return fail("请求体解析失败", 400);
  }
  if (!isCategory(category)) {
    return fail(`未知分类「${category}」`, 400);
  }
  try {
    const result = await aggregateSearch(category as CategoryId, q);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
