import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/auth";
import { now, one, rows, run, uid } from "@/lib/db";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  all_day: z.boolean().default(true),
  time_start: z.string().max(10).nullable().optional(),
  time_end: z.string().max(10).nullable().optional(),
});

const PatchSchema = CreateSchema.partial().extend({ id: z.string().min(1) });

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

/**
 * 服务端计算出的派生事件（SSL 证书到期、备份记录）。
 * 这些记录 source != 'manual'，不能手动删改。
 */
function derivedEvents(): CalendarEvent[] {
  const out: CalendarEvent[] = [];

  const certs = rows<{
    id: string;
    domain: string;
    not_after: string | null;
    days_left: number | null;
  }>("SELECT id, domain, not_after, days_left FROM ssl_certs WHERE not_after IS NOT NULL");
  for (const c of certs) {
    const date = String(c.not_after).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      id: `ssl_${c.id}`,
      title: `SSL 证书到期 · ${c.domain}${c.days_left !== null ? `（剩 ${c.days_left} 天）` : ""}`,
      date,
      all_day: 1,
      time_start: null,
      time_end: null,
      source: "ssl",
      ref_id: c.id,
      created_at: now(),
    });
  }

  const backups = rows<{ id: string; created_at: string; path: string }>(
    "SELECT id, created_at, path FROM backups ORDER BY created_at DESC LIMIT 60",
  );
  for (const b of backups) {
    const date = String(b.created_at).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      id: `backup_${b.id}`,
      title: `备份记录 · ${b.path.split(/[\\/]/).pop() ?? b.path}`,
      date,
      all_day: 1,
      time_start: null,
      time_end: null,
      source: "backup",
      ref_id: b.id,
      created_at: b.created_at,
    });
  }

  return out;
}

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const manual = rows<CalendarEvent>("SELECT * FROM calendar_events WHERE source = 'manual' ORDER BY date ASC");
  let events = [...manual, ...derivedEvents()];
  if (from) events = events.filter((e) => e.date >= from);
  if (to) events = events.filter((e) => e.date <= to);
  events.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));

  return ok({ events });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;

  const id = uid("cal_");
  run(
    "INSERT INTO calendar_events(id, title, date, all_day, time_start, time_end, source, ref_id, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    d.title,
    d.date,
    d.all_day ? 1 : 0,
    d.all_day ? null : (d.time_start ?? null),
    d.all_day ? null : (d.time_end ?? null),
    "manual",
    null,
    now(),
  );
  audit(me.id, "calendar.create", d.title, { id, date: d.date }, clientIp(req));
  const created = one<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", id);
  return ok({ event: created ?? null });
}

export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { id, ...d } = parsed.data;

  const target = one<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", id);
  if (!target) return fail("事件不存在", 404);
  if (target.source !== "manual") {
    return fail("该事件由系统自动生成，不能修改", 403);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (d.title !== undefined) {
    sets.push("title = ?");
    params.push(d.title);
  }
  if (d.date !== undefined) {
    sets.push("date = ?");
    params.push(d.date);
  }
  if (d.all_day !== undefined) {
    sets.push("all_day = ?");
    params.push(d.all_day ? 1 : 0);
  }
  if (d.time_start !== undefined) {
    sets.push("time_start = ?");
    params.push(d.time_start);
  }
  if (d.time_end !== undefined) {
    sets.push("time_end = ?");
    params.push(d.time_end);
  }
  if (!sets.length) return fail("没有可更新的字段");
  params.push(id);
  run(`UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ?`, ...params);

  audit(me.id, "calendar.update", target.title, { id }, clientIp(req));
  const updated = one<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", id);
  return ok({ event: updated ?? null });
}

export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少 id");

  const target = one<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", id);
  if (!target) return fail("事件不存在", 404);
  if (target.source !== "manual") {
    return fail("该事件由系统自动生成（SSL/备份），不能手动删除", 403);
  }

  run("DELETE FROM calendar_events WHERE id = ?", id);
  audit(me.id, "calendar.delete", target.title, { id }, clientIp(req));
  return ok({ deleted: id });
}
