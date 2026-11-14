import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { collectHostSnapshot, type HostSnapshot } from "@/lib/sysinfo";
import { getJSON, setJSON } from "@/lib/db";

export const dynamic = "force-dynamic";

const HISTORY_KEY = "host.history";
const MAX_POINTS = 60;

function pushHistory(snap: HostSnapshot): void {
  const hist = getJSON<HostSnapshot[]>(HISTORY_KEY, []);
  hist.push(snap);
  while (hist.length > MAX_POINTS) hist.shift();
  setJSON(HISTORY_KEY, hist);
}

/** GET /api/monitor/host */
export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;

  try {
    const snap = await collectHostSnapshot();
    pushHistory(snap);
    const history = getJSON<HostSnapshot[]>(HISTORY_KEY, []);
    return ok({ snapshot: snap, history });
  } catch (e) {
    return fail(`主机信息采集失败：${(e as Error).message}`, 500);
  }
}
