import { ok, fail } from "@/lib/api";
import { getPackSummary, getPackItems } from "@/lib/navpack";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const pack = getPackSummary(id);
    if (!pack) return fail("导航包不存在", 404);
    return ok({ pack, items: getPackItems(id) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
