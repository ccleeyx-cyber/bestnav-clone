import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { audit } from "@/lib/auth";
import { getJSON, setJSON } from "@/lib/db";
import {
  ensureScheduler,
  getWatchlist,
  listCerts,
  runBatch,
  setWatchlist,
  type WatchedDomain,
} from "@/lib/ssl";

export const dynamic = "force-dynamic";

const WatchSchema = z.object({
  domains: z.array(
    z.object({
      domain: z.string().min(1).max(255),
      label: z.string().max(120).optional(),
      enabled: z.boolean().optional(),
    }),
  ),
});

const IntervalSchema = z.object({ intervalSec: z.number().int().min(60).max(86400 * 7) });

/** GET /api/ssl — certificates + watchlist */
export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  ensureScheduler();
  return ok({
    certs: listCerts(),
    watchlist: getWatchlist(),
    intervalSec: getJSON<number>("ssl.intervalSec", 6 * 3600),
    schedulerRunning: true,
  });
}

/** POST /api/ssl — run a batch inspection now, or update the watchlist */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  ensureScheduler();

  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "check";

  if (mode === "watchlist") {
    const parsed = WatchSchema.safeParse(body);
    if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
    setWatchlist(parsed.data.domains as WatchedDomain[]);
    audit(u.id, "ssl.watchlist.update", "ssl", { count: parsed.data.domains.length }, req.headers.get("x-forwarded-for") ?? "");
    return ok({ watchlist: getWatchlist() });
  }

  if (mode === "interval") {
    const parsed = IntervalSchema.safeParse(body);
    if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
    setJSON("ssl.intervalSec", parsed.data.intervalSec);
    return ok({ intervalSec: parsed.data.intervalSec });
  }

  const results = await runBatch();
  audit(u.id, "ssl.check", "ssl", { count: results.length }, req.headers.get("x-forwarded-for") ?? "");
  return ok({ results, certs: listCerts() });
}
