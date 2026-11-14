import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/auth";
import { json, now, one, rows, run, uid } from "@/lib/db";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";

const TodoSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1).max(500),
  done: z.boolean().default(false),
});

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20000).default(""),
  folder: z.string().max(100).default(""),
  pinned: z.boolean().default(false),
  todo: z.array(TodoSchema).default([]),
});

const PatchSchema = CreateSchema.partial().extend({ id: z.string().min(1) });

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

/** member 只能看/改自己的笔记；admin/owner 看全部。 */
function scopeWhere(me: { id: string; role: string }) {
  if (me.role === "owner" || me.role === "admin") return { sql: "1 = 1", params: [] as unknown[] };
  return { sql: "(owner_id = ? OR owner_id IS NULL)", params: [me.id] as unknown[] };
}

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  const url = new URL(req.url);
  const folder = url.searchParams.get("folder");
  const pinned = url.searchParams.get("pinned");
  const w = scopeWhere(me);
  const where: string[] = [w.sql];
  const params: unknown[] = [...w.params];
  if (folder) {
    where.push("folder = ?");
    params.push(folder);
  }
  if (pinned === "1") where.push("pinned = 1");

  const list = rows<Note & { todo: string }>(
    `SELECT * FROM notes WHERE ${where.join(" AND ")} ORDER BY pinned DESC, updated_at DESC`,
    ...params,
  );
  const folders = rows<{ folder: string; n: number }>(
    `SELECT folder, COUNT(*) AS n FROM notes WHERE ${w.sql} GROUP BY folder`,
    ...w.params,
  );

  return ok({
    notes: list.map((n) => ({ ...n, todo: json<unknown[]>(n.todo, []) })),
    folders,
  });
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

  const id = uid("n_");
  const ts = now();
  run(
    "INSERT INTO notes(id, title, body, folder, pinned, todo, owner_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    d.title,
    d.body,
    d.folder,
    d.pinned ? 1 : 0,
    JSON.stringify(d.todo),
    me.id,
    ts,
    ts,
  );
  audit(me.id, "note.create", d.title, { id }, clientIp(req));
  const created = one<Note & { todo: string }>("SELECT * FROM notes WHERE id = ?", id);
  return ok({ note: created ? { ...created, todo: json<unknown[]>(created.todo, []) } : null });
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

  const target = one<Note & { todo: string }>("SELECT * FROM notes WHERE id = ?", id);
  if (!target) return fail("笔记不存在", 404);

  const isAdmin = me.role === "owner" || me.role === "admin";
  if (!isAdmin && target.owner_id !== me.id) return fail("无权修改他人笔记", 403);

  const sets: string[] = [];
  const params: unknown[] = [];
  if (d.title !== undefined) {
    sets.push("title = ?");
    params.push(d.title);
  }
  if (d.body !== undefined) {
    sets.push("body = ?");
    params.push(d.body);
  }
  if (d.folder !== undefined) {
    sets.push("folder = ?");
    params.push(d.folder);
  }
  if (d.pinned !== undefined) {
    sets.push("pinned = ?");
    params.push(d.pinned ? 1 : 0);
  }
  if (d.todo !== undefined) {
    sets.push("todo = ?");
    params.push(JSON.stringify(d.todo));
  }
  if (!sets.length) return fail("没有可更新的字段");
  sets.push("updated_at = ?");
  params.push(now());
  params.push(id);
  run(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, ...params);

  audit(me.id, "note.update", target.title, { id }, clientIp(req));
  const updated = one<Note & { todo: string }>("SELECT * FROM notes WHERE id = ?", id);
  return ok({ note: updated ? { ...updated, todo: json<unknown[]>(updated.todo, []) } : null });
}

export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少 id");

  const target = one<Note & { todo: string }>("SELECT * FROM notes WHERE id = ?", id);
  if (!target) return fail("笔记不存在", 404);
  const isAdmin = me.role === "owner" || me.role === "admin";
  if (!isAdmin && target.owner_id !== me.id) return fail("无权删除他人笔记", 403);

  run("DELETE FROM notes WHERE id = ?", id);
  audit(me.id, "note.delete", target.title, { id }, clientIp(req));
  return ok({ deleted: id });
}
