import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rows, run, now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { clientIp } from "../bookmarks/_lib";

export const dynamic = "force-dynamic";

/** 允许匿名读取的设置键（公开外观配置）。 */
const PUBLIC_KEYS = [
  "template",
  "theme",
  "background",
  "backgroundBlur",
  "backgroundDim",
  "locale",
  "gridDensity",
  "siteTitle",
  "siteSubtitle",
  "searchProvider",
];

const KNOWN_KEYS = [
  ...PUBLIC_KEYS,
  "navMode",
  "internalMode",
  "defaultVisibility",
  "iconProvider",
  "cardWall",
  "backgroundColor",
  "backgroundImage",
  "blur",
  "dim",
  "accentColor",
  "showWeather",
  "footerText",
  "bookmarkColumns",
];

const PatchSchema = z.object({
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  key: z.string().max(120).optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

function readAll(): Record<string, string> {
  const list = rows<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, string> = {};
  for (const r of list) out[r.key] = r.value;
  return out;
}

export async function GET() {
  const u = await currentUser();
  const all = readAll();
  if (u) return ok(all);
  const pub: Record<string, string> = {};
  for (const k of PUBLIC_KEYS) if (k in all) pub[k] = all[k];
  return ok(pub);
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("未登录", 401);
  const body = await parseBody(req, PatchSchema);
  if (body instanceof NextResponse) return body;

  const entries: [string, string][] = [];
  if (body.settings) {
    for (const [k, v] of Object.entries(body.settings)) {
      entries.push([k, v === null ? "" : String(v)]);
    }
  } else if (body.key) {
    entries.push([body.key, body.value === null || body.value === undefined ? "" : String(body.value)]);
  }
  if (!entries.length) return fail("没有需要更新的设置");

  const ts = now();
  for (const [k, v] of entries) {
    run(
      "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      k,
      v,
      ts,
    );
  }
  audit(u.id, "settings.update", entries.map((e) => e[0]).join(","), { count: entries.length }, clientIp(req));
  return ok(readAll());
}
