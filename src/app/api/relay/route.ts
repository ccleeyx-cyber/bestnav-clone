import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { one, rows, run, now, uid, json } from "@/lib/db";
import { encryptSecret, decryptSecret, maskSecret, hashKey } from "@/lib/crypto";
import { pickRelays, markRelayState, recordUsage, findRelayToken, tokenAllowed, type RelayRow } from "@/lib/relay";
import { currentUser, isAdmin } from "@/lib/session";
import { audit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- 供应商管理 ---------- */

const RelaySchema = z.object({
  name: z.string().min(1),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  models: z.array(z.string()).default([]),
  priority: z.number().int().default(0),
  weight: z.number().int().default(1),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const list = rows<RelayRow>("SELECT * FROM relays ORDER BY priority ASC");
  return ok(
    list.map((r) => ({
      id: r.id,
      name: r.name,
      base_url: r.base_url,
      api_key_masked: maskSecret(decryptSecret(r.api_key_enc)),
      models: json<string[]>(r.models, []),
      priority: r.priority,
      weight: r.weight,
      enabled: !!r.enabled,
      health_state: r.health_state,
      cooldown_until: r.cooldown_until,
      created_at: r.created_at,
    })),
  );
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const parsed = RelaySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;
  const id = uid("r_");
  const ts = now();
  run(
    "INSERT INTO relays(id,name,base_url,api_key_enc,models,priority,enabled,weight,health_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id,
    d.name,
    d.base_url.replace(/\/+$/, ""),
    encryptSecret(d.api_key),
    JSON.stringify(d.models),
    d.priority,
    d.enabled ? 1 : 0,
    d.weight,
    "idle",
    ts,
    ts,
  );
  audit(u.id, "relay.create", id, { name: d.name });
  return ok({ id });
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const row = one<RelayRow>("SELECT * FROM relays WHERE id = ?", id);
  if (!row) return fail("中转站不存在", 404);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof body?.name === "string") { sets.push("name = ?"); params.push(body.name); }
  if (typeof body?.base_url === "string") { sets.push("base_url = ?"); params.push(body.base_url.replace(/\/+$/, "")); }
  if (typeof body?.api_key === "string" && body.api_key) { sets.push("api_key_enc = ?"); params.push(encryptSecret(body.api_key)); }
  if (Array.isArray(body?.models)) { sets.push("models = ?"); params.push(JSON.stringify(body.models)); }
  if (typeof body?.priority === "number") { sets.push("priority = ?"); params.push(body.priority); }
  if (typeof body?.weight === "number") { sets.push("weight = ?"); params.push(body.weight); }
  if (typeof body?.enabled === "boolean") { sets.push("enabled = ?"); params.push(body.enabled ? 1 : 0); }
  if (!sets.length) return fail("没有可更新的字段");
  sets.push("updated_at = ?");
  params.push(now(), id);
  run(`UPDATE relays SET ${sets.join(", ")} WHERE id = ?`, ...params);
  audit(u.id, "relay.update", id, body);
  return ok({ id });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("缺少 id");
  run("DELETE FROM relays WHERE id = ?", id);
  audit(u.id, "relay.delete", id);
  return ok({ id });
}

