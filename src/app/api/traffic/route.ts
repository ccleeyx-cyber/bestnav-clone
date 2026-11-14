import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { audit } from "@/lib/auth";
import { getJSON, setJSON } from "@/lib/db";
import {
  ensureSampler,
  getThresholds,
  ifaceBreakdown,
  listEvents,
  liveRate,
  rangeStart,
  sample,
  setThresholds,
  softwareRanking,
  summarize,
  type RangeKey,
} from "@/lib/traffic";

export const dynamic = "force-dynamic";

const RANGES: RangeKey[] = ["today", "24h", "7d", "30d", "90d", "month", "year", "all"];

const ThresholdSchema = z.object({
  downBps: z.number().int().min(0),
  upBps: z.number().int().min(0),
  dailyBytes: z.number().int().min(0),
});

/** GET /api/traffic?range=24h */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  ensureSampler();

  const url = new URL(req.url);
  const raw = url.searchParams.get("range") ?? "24h";
  const range = (RANGES as string[]).includes(raw) ? (raw as RangeKey) : "24h";
  const summary = summarize(range);
  const apps = await softwareRanking();

  return ok({
    summary,
    range,
    live: liveRate(),
    ifaces: ifaceBreakdown(rangeStart(range)),
    apps,
    events: listEvents(30),
    thresholds: getThresholds(),
    sampleSec: getJSON<number>("traffic.sampleSec", 60),
  });
}

/** POST /api/traffic — update thresholds, interval, or force a sample */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  ensureSampler();

  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "";

  if (mode === "thresholds") {
    const parsed = ThresholdSchema.safeParse(body);
    if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
    setThresholds(parsed.data);
    audit(u.id, "traffic.thresholds", "traffic", parsed.data, req.headers.get("x-forwarded-for") ?? "");
    return ok({ thresholds: getThresholds() });
  }

  if (mode === "interval") {
    const sec = Math.max(15, Math.min(3600, Number(body?.intervalSec) || 60));
    setJSON("traffic.sampleSec", sec);
    return ok({ sampleSec: sec });
  }

  if (mode === "sample") {
    const written = await sample();
    return ok({ written });
  }

  return fail("未知模式", 422);
}
