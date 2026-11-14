import { ok, fail, isResponse, requireUser } from "@/lib/api";
import { installPack, getPackSummary } from "@/lib/navpack";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let body: { packId?: unknown; itemIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const packId = typeof body.packId === "string" ? body.packId : "";
  if (!packId) return fail("缺少 packId", 422);
  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((x): x is string => typeof x === "string")
    : undefined;
  try {
    const pack = getPackSummary(packId);
    if (!pack) return fail("导航包不存在", 404);
    const result = installPack(packId, itemIds, user.id);
    return ok({ ...result, packName: pack.name, message: `将新增 ${result.added} 个，跳过 ${result.skipped} 个已存在` });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

/** 预演：只算数量，不写入。 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const packId = url.searchParams.get("packId") ?? "";
  if (!packId) return fail("缺少 packId", 422);
  const pack = getPackSummary(packId);
  if (!pack) return fail("导航包不存在", 404);
  const itemIds = (url.searchParams.get("itemIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const { getPackItems } = await import("@/lib/navpack");
  const all = getPackItems(packId);
  const targets = itemIds.length ? all.filter((i) => itemIds.includes(i.id)) : all;
  let skipped = 0;
  for (const item of targets) {
    const dup = one<{ id: string }>(
      "SELECT id FROM bookmarks WHERE url = ? AND title = ? LIMIT 1",
      item.url,
      item.title,
    );
    if (dup) skipped += 1;
  }
  return ok({
    packId,
    total: targets.length,
    willAdd: targets.length - skipped,
    skipped,
    message: `将新增 ${targets.length - skipped} 个，跳过 ${skipped} 个已存在`,
  });
}
