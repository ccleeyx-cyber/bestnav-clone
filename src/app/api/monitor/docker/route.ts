import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { audit } from "@/lib/auth";
import {
  DOCKER_SETUP_HINT,
  attachWsUrl,
  composeProject,
  containerLogs,
  containerName,
  containerOp,
  containerStats,
  dockerConfigured,
  listContainers,
  type DockerOp,
} from "@/lib/docker";

export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
  ids: z.array(z.string().min(1)).min(1),
});

/** GET /api/monitor/docker — container list + stats snapshot */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  if (!dockerConfigured()) {
    return ok({
      configured: false,
      hint: DOCKER_SETUP_HINT,
      containers: [],
      stats: {},
    });
  }

  const url = new URL(req.url);
  const wantStats = url.searchParams.get("stats") !== "0";

  try {
    const containers = await listContainers();
    const stats: Record<string, unknown> = {};
    if (wantStats) {
      await Promise.all(
        containers.map(async (c) => {
          try {
            stats[c.Id] = await containerStats(c.Id);
          } catch {
            stats[c.Id] = null;
          }
        }),
      );
    }
    return ok({
      configured: true,
      containers: containers.map((c) => ({
        id: c.Id,
        name: containerName(c),
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports: c.Ports ?? [],
        project: composeProject(c),
        labels: c.Labels ?? {},
        created: c.Created ?? 0,
        // Attach URL is exposed so the browser can open the raw WebSocket
        // to the Docker Engine (no docker.sock is mounted by this app).
        attachUrl: attachWsUrl(c.Id),
      })),
      stats,
    });
  } catch (e) {
    return fail(`Docker 访问失败：${(e as Error).message}`, 502);
  }
}

/** POST /api/monitor/docker — controlled operations (start/stop/restart) */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { action, ids } = parsed.data;

  if (!dockerConfigured()) return fail("Docker 未接入", 400);

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      await containerOp(id, action as DockerOp);
      results.push({ id, ok: true });
      audit(u.id, `docker.${action}`, id, {}, req.headers.get("x-forwarded-for") ?? "");
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  return ok({ results, okCount, total: results.length });
}
