import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rows, one, run, now, uid } from "@/lib/db";
import { audit } from "@/lib/auth";
import type { Group, Visibility } from "@/lib/types";
import { canWrite, clientIp, visibleWhere } from "../bookmarks/_lib";

export const dynamic = "force-dynamic";

function toDTO(g: Group) {
  return {
    id: g.id,
    name: g.name,
    icon: g.icon ?? "",
    sort_order: g.sort_order,
    visibility: g.visibility,
    owner_id: g.owner_id,
    collapsed: g.collapsed,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(64).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
  collapsed: z.number().int().optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  icon: z.string().max(64).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
  collapsed: z.number().int().optional(),
});

export async function GET() {
  const u = await currentUser();
  const w = visibleWhere(u, "groups");
  const list = rows<Group>(
    `SELECT g.* FROM groups g WHERE ${w.sql} ORDER BY g.sort_order ASC, g.created_at ASC`,
    ...w.params,
  );
  return ok(list.map(toDTO));
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, CreateSchema);
  if (body instanceof NextResponse) return body;
  const ts = now();
  const id = uid("g_");
  run(
    `INSERT INTO groups(id, name, icon, sort_order, visibility, owner_id, collapsed, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    id,
    body.name,
    body.icon ?? "",
    body.sort_order ?? 0,
    body.visibility ?? "public",
    u.id,
    body.collapsed ?? 0,
    ts,
    ts,
  );
  audit(u.id, "group.create", id, { name: body.name }, clientIp(req));
  return ok(toDTO(one<Group>("SELECT * FROM groups WHERE id = ?", id)!));
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, PatchSchema);
  if (body instanceof NextResponse) return body;
  const cur = one<Group>("SELECT * FROM groups WHERE id = ?", body.id);
  if (!cur) return fail("分组不存在", 404);
  if (!canWrite(cur, u)) return fail("无权修改该分组", 403);

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (c: string, v: unknown) => {
    sets.push(`${c} = ?`);
    params.push(v);
  };
  if (body.name !== undefined) push("name", body.name);
  if (body.icon !== undefined) push("icon", body.icon);
  if (body.visibility !== undefined) push("visibility", body.visibility);
  if (body.sort_order !== undefined) push("sort_order", body.sort_order);
  if (body.collapsed !== undefined) push("collapsed", body.collapsed);
  if (!sets.length) return fail("没有需要更新的字段");
  push("updated_at", now());
  run(`UPDATE groups SET ${sets.join(", ")} WHERE id = ?`, ...params, body.id);
  audit(u.id, "group.update", body.id, { fields: sets.length }, clientIp(req));
  return ok(toDTO(one<Group>("SELECT * FROM groups WHERE id = ?", body.id)!));
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("缺少 id");
  const cur = one<Group>("SELECT * FROM groups WHERE id = ?", id);
  if (!cur) return fail("分组不存在", 404);
  if (!canWrite(cur, u)) return fail("无权删除该分组", 403);
  // 书签 group_id 置空，不连带删除
  run("UPDATE bookmarks SET group_id = NULL, updated_at = ? WHERE group_id = ?", now(), id);
  run("DELETE FROM groups WHERE id = ?", id);
  audit(u.id, "group.delete", id, { name: cur.name }, clientIp(req));
  return ok({ id });
}
