import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rows, one, run, now, uid, json } from "@/lib/db";
import { audit } from "@/lib/auth";
import type { Bookmark, Group, Visibility } from "@/lib/types";
import { canWrite, clientIp, visibleWhere } from "./_lib";

export const dynamic = "force-dynamic";

interface BookmarkDTO {
  id: string;
  group_id: string | null;
  title: string;
  url: string;
  internal_url: string | null;
  description: string;
  icon: string;
  icon_color: string;
  tags: string[];
  visibility: Visibility;
  owner_id: string | null;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toDTO(b: Bookmark): BookmarkDTO {
  return {
    id: b.id,
    group_id: b.group_id,
    title: b.title,
    url: b.url,
    internal_url: b.internal_url,
    description: b.description ?? "",
    icon: b.icon ?? "",
    icon_color: b.icon_color ?? "",
    tags: json<string[]>(b.tags, []),
    visibility: b.visibility,
    owner_id: b.owner_id,
    sort_order: b.sort_order,
    enabled: b.enabled,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

const CreateSchema = z.object({
  group_id: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  internal_url: z.string().max(2000).nullable().optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(500).optional(),
  icon_color: z.string().max(64).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  group_id: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  url: z.string().min(1).max(2000).optional(),
  internal_url: z.string().max(2000).nullable().optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(500).optional(),
  icon_color: z.string().max(64).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
  enabled: z.number().int().optional(),
});

/** GET /api/bookmarks — 返回按分组组织的结构。 */
export async function GET(req: Request) {
  const u = await currentUser();
  const url = new URL(req.url);
  const flat = url.searchParams.get("flat") === "1";
  const groupId = url.searchParams.get("group_id");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const w = visibleWhere(u, "bookmarks");
  const params: unknown[] = [...w.params];
  let where = w.sql;
  if (groupId) {
    where += ` AND b.group_id = ?`;
    params.push(groupId);
  }
  const list = rows<Bookmark>(
    `SELECT b.* FROM bookmarks b WHERE ${where} ORDER BY b.sort_order ASC, b.created_at ASC`,
    ...params,
  );

  let items = list.map(toDTO);
  if (q) {
    items = items.filter((b) => {
      const hay = [b.title, b.description, b.url, b.internal_url ?? "", ...b.tags]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (flat) return ok(items);

  // 分组聚合：可见分组 + 组内书签
  const gw = visibleWhere(u, "groups");
  const groups = rows<Group>(
    `SELECT g.* FROM groups g WHERE ${gw.sql} ORDER BY g.sort_order ASC, g.created_at ASC`,
    ...gw.params,
  );

  const result = groups.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon ?? "",
    sort_order: g.sort_order,
    visibility: g.visibility,
    collapsed: g.collapsed,
    bookmarks: items.filter((b) => b.group_id === g.id),
  }));
  const ungrouped = items.filter((b) => !b.group_id || !groups.some((g) => g.id === b.group_id));
  if (ungrouped.length) {
    result.push({
      id: "__ungrouped__",
      name: "未分组",
      icon: "",
      sort_order: 999999,
      visibility: "public" as Visibility,
      collapsed: 0,
      bookmarks: ungrouped,
    });
  }
  return ok(result);
}

/** POST /api/bookmarks — 新建书签。 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, CreateSchema);
  if (body instanceof NextResponse) return body;

  const ts = now();
  const id = uid("b_");
  const tags = JSON.stringify(body.tags ?? []);
  run(
    `INSERT INTO bookmarks(id, group_id, title, url, internal_url, description, icon, icon_color, tags, visibility, owner_id, sort_order, enabled, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    id,
    body.group_id ?? null,
    body.title,
    body.url,
    body.internal_url ?? null,
    body.description ?? "",
    body.icon ?? "",
    body.icon_color ?? "",
    tags,
    body.visibility ?? "public",
    u.id,
    body.sort_order ?? 0,
    ts,
    ts,
  );
  audit(u.id, "bookmark.create", id, { title: body.title }, clientIp(req));
  const row = one<Bookmark>("SELECT * FROM bookmarks WHERE id = ?", id)!;
  return ok(toDTO(row));
}

/** PATCH /api/bookmarks — 更新书签。 */
export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, PatchSchema);
  if (body instanceof NextResponse) return body;

  const cur = one<Bookmark>("SELECT * FROM bookmarks WHERE id = ?", body.id);
  if (!cur) return fail("书签不存在", 404);
  if (!canWrite(cur, u)) return fail("无权修改该书签", 403);

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };
  if (body.group_id !== undefined) push("group_id", body.group_id);
  if (body.title !== undefined) push("title", body.title);
  if (body.url !== undefined) push("url", body.url);
  if (body.internal_url !== undefined) push("internal_url", body.internal_url);
  if (body.description !== undefined) push("description", body.description);
  if (body.icon !== undefined) push("icon", body.icon);
  if (body.icon_color !== undefined) push("icon_color", body.icon_color);
  if (body.tags !== undefined) push("tags", JSON.stringify(body.tags));
  if (body.visibility !== undefined) push("visibility", body.visibility);
  if (body.sort_order !== undefined) push("sort_order", body.sort_order);
  if (body.enabled !== undefined) push("enabled", body.enabled);
  if (!sets.length) return fail("没有需要更新的字段");

  push("updated_at", now());
  run(`UPDATE bookmarks SET ${sets.join(", ")} WHERE id = ?`, ...params, body.id);
  audit(u.id, "bookmark.update", body.id, { fields: sets.length }, clientIp(req));
  const row = one<Bookmark>("SELECT * FROM bookmarks WHERE id = ?", body.id)!;
  return ok(toDTO(row));
}

/** DELETE /api/bookmarks?id=... */
export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("缺少 id");
  const cur = one<Bookmark>("SELECT * FROM bookmarks WHERE id = ?", id);
  if (!cur) return fail("书签不存在", 404);
  if (!canWrite(cur, u)) return fail("无权删除该书签", 403);
  run("DELETE FROM bookmarks WHERE id = ?", id);
  audit(u.id, "bookmark.delete", id, { title: cur.title }, clientIp(req));
  return ok({ id });
}
