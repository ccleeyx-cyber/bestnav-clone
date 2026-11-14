import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rows, one, run, now, uid, json } from "@/lib/db";
import { audit } from "@/lib/auth";
import type { Card, Visibility } from "@/lib/types";
import { canWrite, clientIp, visibleWhere } from "../bookmarks/_lib";

export const dynamic = "force-dynamic";

export interface CardPosition {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  template?: string;
}

function toDTO(c: Card) {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title ?? "",
    config: json<Record<string, unknown>>(c.config, {}),
    position: json<CardPosition>(c.position, {}),
    visibility: c.visibility,
    owner_id: c.owner_id,
    sort_order: c.sort_order,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

const CreateSchema = z.object({
  kind: z.string().min(1).max(40),
  title: z.string().max(200).optional(),
  config: z.record(z.unknown()).optional(),
  position: z.record(z.unknown()).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).max(40).optional(),
  title: z.string().max(200).optional(),
  config: z.record(z.unknown()).optional(),
  position: z.record(z.unknown()).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort_order: z.number().int().optional(),
});

export async function GET() {
  const u = await currentUser();
  const w = visibleWhere(u, "cards");
  const list = rows<Card>(
    `SELECT c.* FROM cards c WHERE ${w.sql} ORDER BY c.sort_order ASC, c.created_at ASC`,
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
  const id = uid("c_");
  run(
    `INSERT INTO cards(id, kind, title, config, position, visibility, owner_id, sort_order, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    id,
    body.kind,
    body.title ?? "",
    JSON.stringify(body.config ?? {}),
    JSON.stringify(body.position ?? {}),
    body.visibility ?? "public",
    u.id,
    body.sort_order ?? 0,
    ts,
    ts,
  );
  audit(u.id, "card.create", id, { kind: body.kind }, clientIp(req));
  return ok(toDTO(one<Card>("SELECT * FROM cards WHERE id = ?", id)!));
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, PatchSchema);
  if (body instanceof NextResponse) return body;
  const cur = one<Card>("SELECT * FROM cards WHERE id = ?", body.id);
  if (!cur) return fail("卡片不存在", 404);
  if (!canWrite(cur, u)) return fail("无权修改该卡片", 403);

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (c: string, v: unknown) => {
    sets.push(`${c} = ?`);
    params.push(v);
  };
  if (body.kind !== undefined) push("kind", body.kind);
  if (body.title !== undefined) push("title", body.title);
  if (body.config !== undefined) push("config", JSON.stringify(body.config));
  if (body.position !== undefined) push("position", JSON.stringify(body.position));
  if (body.visibility !== undefined) push("visibility", body.visibility);
  if (body.sort_order !== undefined) push("sort_order", body.sort_order);
  if (!sets.length) return fail("没有需要更新的字段");
  push("updated_at", now());
  run(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`, ...params, body.id);
  audit(u.id, "card.update", body.id, { fields: sets.length }, clientIp(req));
  return ok(toDTO(one<Card>("SELECT * FROM cards WHERE id = ?", body.id)!));
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("缺少 id");
  const cur = one<Card>("SELECT * FROM cards WHERE id = ?", id);
  if (!cur) return fail("卡片不存在", 404);
  if (!canWrite(cur, u)) return fail("无权删除该卡片", 403);
  run("DELETE FROM cards WHERE id = ?", id);
  audit(u.id, "card.delete", id, { kind: cur.kind }, clientIp(req));
  return ok({ id });
}
