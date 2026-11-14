import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { summarize, type TrendRange } from "@/lib/visitors";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("today"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "monitoring.manage") && !can(me, "users.manage")) {
    return fail("需要管理员权限", 403);
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());

  return ok(summarize(parsed.data.range as TrendRange, parsed.data.limit));
}
