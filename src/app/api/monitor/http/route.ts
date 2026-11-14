import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { audit } from "@/lib/auth";
import { now, one, rows, run, uid } from "@/lib/db";
import { checkHttp } from "@/lib/http-monitor";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["container", "host", "ssl", "http"]).default("http"),
  target: z.string().min(1).max(500),
  interval_sec: z.number().int().min(10).max(86400).default(60),
  threshold: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  target: z.string().min(1).max(500).optional(),
  interval_sec: z.number().int().min(10).max(86400).optional(),
  threshold: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

/** GET /api/monitor/http — list http service monitors */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const m = one("SELECT * FROM monitors WHERE id = ?", id);
    if (!m) return fail("监控项不存在", 404);
    const result = await checkHttp(String((m as any).target));
    run(
      "UPDATE monitors SET last_status=?, last_checked_at=?, last_detail=? WHERE id=?",
      result.ok ? "up" : "down",
      now(),
      JSON.stringify(result),
      id,
    );
    const updated = one("SELECT * FROM monitors WHERE id = ?", id);
    return ok({ monitor: updated, result });
  }

  const list = rows("SELECT * FROM monitors WHERE kind = 'http' ORDER BY created_at DESC");
  return ok({ monitors: list });
}

/** POST /api/monitor/http — create a monitor */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;

  const id = uid("m_");
  const ts = now();
  run(
    `INSERT INTO monitors(id, name, kind, target, interval_sec, threshold, enabled, last_status, last_checked_at, last_detail, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    d.name,
    d.kind,
    d.target,
    d.interval_sec,
    JSON.stringify(d.threshold ?? {}),
    d.enabled ? 1 : 0,
    "unknown",
    null,
    "{}",
    ts,
    ts,
  );
  audit(u.id, "monitor.http.create", id, { name: d.name, target: d.target }, req.headers.get("x-forwarded-for") ?? "");
  const monitor = one("SELECT * FROM monitors WHERE id = ?", id);
  return ok({ monitor });
}

/** PATCH /api/monitor/http — update a monitor */
export async function PATCH(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;

  const cur = one("SELECT * FROM monitors WHERE id = ?", d.id) as Record<string, unknown> | undefined;
  if (!cur) return fail("监控项不存在", 404);

  run(
    `UPDATE monitors SET name=?, target=?, interval_sec=?, threshold=?, enabled=?, updated_at=? WHERE id=?`,
    d.name ?? cur.name,
    d.target ?? cur.target,
    d.interval_sec ?? cur.interval_sec,
    d.threshold !== undefined ? JSON.stringify(d.threshold) : cur.threshold,
    d.enabled === undefined ? cur.enabled : d.enabled ? 1 : 0,
    now(),
    d.id,
  );
  audit(u.id, "monitor.http.update", d.id, d, req.headers.get("x-forwarded-for") ?? "");
  const monitor = one("SELECT * FROM monitors WHERE id = ?", d.id);
  return ok({ monitor });
}

/** DELETE /api/monitor/http?id= */
export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少 id", 422);
  const cur = one("SELECT id FROM monitors WHERE id = ?", id);
  if (!cur) return fail("监控项不存在", 404);
  run("DELETE FROM monitors WHERE id = ?", id);
  audit(u.id, "monitor.http.delete", id, {}, req.headers.get("x-forwarded-for") ?? "");
  return ok({ id, deleted: true });
}
