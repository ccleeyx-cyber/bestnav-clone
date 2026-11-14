import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { one, rows, run, now, uid } from "@/lib/db";
import { hashKey, maskSecret } from "@/lib/crypto";
import { currentUser, isAdmin } from "@/lib/session";
import { audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1),
  allowed_tools: z.array(z.string()).default([]),
  allowed_ips: z.array(z.string()).default([]),
  rate_limit: z.number().int().min(0).default(0),
});

export async function GET() {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const list = rows<{
    id: string;
    name: string;
    key_hash: string;
    allowed_tools: string;
    allowed_ips: string;
    rate_limit: number;
    enabled: number;
    created_at: string;
  }>("SELECT * FROM api_keys ORDER BY created_at DESC");
  return ok(
    list.map((k) => ({
      id: k.id,
      name: k.name,
      key_masked: maskSecret(k.key_hash.slice(0, 16)),
      allowed_tools: JSON.parse(k.allowed_tools || "[]") as string[],
      allowed_ips: JSON.parse(k.allowed_ips || "[]") as string[],
      rate_limit: k.rate_limit,
      enabled: !!k.enabled,
      created_at: k.created_at,
    })),
  );
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;
  const raw = `bn_ak_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 14)}`;
  const id = uid("ak_");
  run(
    "INSERT INTO api_keys(id, name, key_hash, allowed_tools, allowed_ips, rate_limit, enabled, created_at) VALUES(?,?,?,?,?,?,1,?)",
    id,
    d.name,
    hashKey(raw),
    JSON.stringify(d.allowed_tools),
    JSON.stringify(d.allowed_ips),
    d.rate_limit,
    now(),
  );
  audit(u.id, "apikey.create", id, { name: d.name });
  return ok({ id, key: raw });
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const row = one<{ id: string }>("SELECT id FROM api_keys WHERE id = ?", id);
  if (!row) return fail("Key 不存在", 404);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof body?.enabled === "boolean") { sets.push("enabled = ?"); params.push(body.enabled ? 1 : 0); }
  if (Array.isArray(body?.allowed_tools)) { sets.push("allowed_tools = ?"); params.push(JSON.stringify(body.allowed_tools)); }
  if (Array.isArray(body?.allowed_ips)) { sets.push("allowed_ips = ?"); params.push(JSON.stringify(body.allowed_ips)); }
  if (typeof body?.rate_limit === "number") { sets.push("rate_limit = ?"); params.push(body.rate_limit); }
  if (!sets.length) return fail("没有可更新的字段");
  params.push(id);
  run(`UPDATE api_keys SET ${sets.join(", ")} WHERE id = ?`, ...params);
  audit(u.id, "apikey.update", id, body);
  return ok({ id });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("缺少 id");
  run("DELETE FROM api_keys WHERE id = ?", id);
  audit(u.id, "apikey.delete", id);
  return ok({ id });
}
