import { ok, fail, isResponse, requireUser } from "@/lib/api";
import { importPackFromUrl } from "@/lib/navpack";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let body: { url?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return fail("缺少 url", 422);
  try {
    const pack = await importPackFromUrl(url);
    return ok({ pack, message: `已导入导航包「${pack.name}」，共 ${pack.item_count} 个站点` });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 400);
  }
}
