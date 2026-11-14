import { ok, fail, isResponse, requireUser } from "@/lib/api";
import { uninstallPack, getPackSummary } from "@/lib/navpack";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let body: { packId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const packId = typeof body.packId === "string" ? body.packId : "";
  if (!packId) return fail("缺少 packId", 422);
  try {
    const pack = getPackSummary(packId);
    if (!pack) return fail("导航包不存在", 404);
    const result = uninstallPack(packId);
    return ok({ ...result, packName: pack.name, message: `已移除 ${result.removed} 个由该包导入的站点` });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
