import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { run, now, uid } from "@/lib/db";
import { hashKey } from "@/lib/crypto";
import { currentUser, isAdmin } from "@/lib/session";
import { audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(1),
  allowed_models: z.array(z.string()).default([]),
  budget_usd: z.number().positive().nullable().default(null),
  expires_at: z.string().nullable().default(null),
});

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;

  const raw = `bn_sk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 14)}`;
  run(
    "INSERT INTO relay_tokens(id,name,token_hash,allowed_models,budget_usd,used_usd,expires_at,enabled,created_at) VALUES(?,?,?,?,?,0,?,1,?)",
    uid("tk_"),
    d.name,
    hashKey(raw),
    JSON.stringify(d.allowed_models),
    d.budget_usd,
    d.expires_at,
    now(),
  );
  audit(u.id, "relay.token.create", d.name, { budget_usd: d.budget_usd });
  return ok({ token: raw, name: d.name });
}

export async function GET() {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  if (!isAdmin(u)) return fail("需要管理员权限", 403);
  const { rows } = await import("@/lib/db");
  const list = rows<{
    id: string; name: string; allowed_models: string; budget_usd: number | null;
    used_usd: number; expires_at: string | null; enabled: number; created_at: string;
  }>("SELECT * FROM relay_tokens ORDER BY created_at DESC");
  return ok(
    list.map((t) => ({
      id: t.id,
      name: t.name,
      allowed_models: JSON.parse(t.allowed_models || "[]") as string[],
      budget_usd: t.budget_usd,
      used_usd: t.used_usd,
      remaining_usd: t.budget_usd != null ? Math.max(0, t.budget_usd - t.used_usd) : null,
      expires_at: t.expires_at,
      enabled: !!t.enabled,
      created_at: t.created_at,
    })),
  );
}
