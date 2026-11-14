import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { findRelayToken, tokenAllowed, pickRelays } from "@/lib/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return fail("缺少 Bearer 令牌", 401);
  const tok = findRelayToken(raw);
  if (!tok || !tok.enabled) return fail("令牌无效", 401);

  const url = new URL(req.url);
  const wanted = url.searchParams.get("model");

  const models = new Set<string>();
  for (const c of pickRelays(wanted ?? "")) {
    for (const m of c.models) models.add(m);
  }
  if (wanted && models.size === 0) models.add(wanted);

  const list = [...models].filter((m) => tokenAllowed(tok, m));
  return NextResponse.json({
    object: "list",
    data: list.map((id) => ({ id, object: "model", owned_by: "bestnav-relay" })),
  });
}

