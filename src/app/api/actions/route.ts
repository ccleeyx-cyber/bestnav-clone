import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { visibleSwitches, performAction, RISK_LABELS } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ExecSchema = z.object({
  switchId: z.string().min(1),
  dryRun: z.boolean().default(false),
  params: z.record(z.string(), z.unknown()).default({}),
});

/**
 * GET /api/actions —— 列出当前用户有权执行的开关。
 * 无权限的开关不返回（不泄露名称）。
 */
export async function GET() {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const list = visibleSwitches(u);
  return ok({
    switches: list.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      impact: s.impact,
      idempotent: s.idempotent,
      params: s.params,
    })),
    riskLabels: RISK_LABELS,
  });
}

/**
 * POST /api/actions —— 统一执行入口。
 * 控制室 UI 与 MCP 触发都走这里，链路与审计完全一致。
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);

  const body = await req.json().catch(() => null);
  const parsed = ExecSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());

  const { switchId, dryRun, params } = parsed.data;
  const result = await performAction(u, switchId, {
    dryRun,
    params,
    source: req.headers.get("x-bn-source") ?? "ui",
    ip: req.headers.get("x-forwarded-for") ?? "",
  });

  return ok({
    ok: result.ok,
    switchId: result.switchId,
    title: result.title,
    risk: result.risk,
    preview: result.preview ?? {},
    message: result.message,
  });
}
