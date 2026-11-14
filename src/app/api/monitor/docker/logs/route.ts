import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { containerLogs, dockerConfigured } from "@/lib/docker";

export const dynamic = "force-dynamic";

/** GET /api/monitor/docker/logs?id=<containerId>&tail=200 */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  if (!dockerConfigured()) return fail("Docker 未接入", 400);

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const tail = Number(url.searchParams.get("tail") ?? "200") || 200;
  if (!id) return fail("缺少容器 id", 422);

  try {
    const logs = await containerLogs(id, tail);
    return ok({ id, tail, logs });
  } catch (e) {
    return fail(`读取日志失败：${(e as Error).message}`, 502);
  }
}
