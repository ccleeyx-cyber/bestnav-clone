import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { getSwitchCatalog, runSwitch } from "@/lib/control";

export const dynamic = "force-dynamic";

const ExecSchema = z.object({
  switchId: z.string().min(1),
  dryRun: z.boolean().default(false),
  params: z.record(z.string(), z.unknown()).default({}),
});

/** GET /api/control — switch definitions (+ recent audit trail with ?history=1) */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const url = new URL(req.url);
  if (url.searchParams.get("history") === "1") {
    const { rows } = await import("@/lib/db");
    const logs = rows(
      "SELECT id, user_id, action, target, detail, created_at FROM audit_logs WHERE action LIKE 'control.%' ORDER BY created_at DESC LIMIT 50",
    );
    return ok({ history: logs });
  }
  return ok({ switches: getSwitchCatalog() });
}

/**
 * POST /api/control
 * body: { switchId, dryRun, params }
 * -> { ok, preview, message }
 */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = ExecSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { switchId, dryRun, params } = parsed.data;

  const outcome = await runSwitch(switchId, {
    dryRun,
    params,
    user: u,
    ip: req.headers.get("x-forwarded-for") ?? "",
  });
  return ok({
    ok: outcome.ok,
    preview: outcome.preview ?? {},
    message: outcome.message,
  });
}
