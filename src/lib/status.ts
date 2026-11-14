import { rows, one } from "./db";

export interface StatusSummary {
  user: { username: string; role: string };
  containers: { total: number; running: number; stopped: number };
  certificates: { total: number; expiringSoon: number };
  bookmarks: number;
  uptimeSeconds: number | null;
}

export async function getStatusSummary(): Promise<StatusSummary> {
  const user = one<{ username: string; role: string }>(
    "SELECT username, role FROM users ORDER BY created_at ASC LIMIT 1",
  );
  const bm = one<{ n: number }>("SELECT COUNT(*) AS n FROM bookmarks WHERE enabled = 1");
  const ssl = one<{ n: number }>("SELECT COUNT(*) AS n FROM ssl_certs");

  let containers = { total: 0, running: 0, stopped: 0 };
  try {
    const host = process.env.DOCKER_HOST?.replace(/^tcp:\/\//, "http://");
    if (host) {
      const r = await fetch(`${host}/containers/json?all=1`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const list = (await r.json()) as { State?: string }[];
        containers.total = list.length;
        containers.running = list.filter((c) => c.State === "running").length;
        containers.stopped = containers.total - containers.running;
      }
    }
  } catch {
    /* Docker 未接入，保持零值 */
  }

  let expiringSoon = 0;
  try {
    const rowsSsl = rows<{ days_left: number | null }>(
      "SELECT days_left FROM ssl_certs WHERE days_left IS NOT NULL",
    );
    expiringSoon = rowsSsl.filter((r) => (r.days_left ?? 999) <= 30).length;
  } catch {
    /* ignore */
  }

  return {
    user: user ?? { username: "unknown", role: "member" },
    containers,
    certificates: { total: ssl?.n ?? 0, expiringSoon },
    bookmarks: bm?.n ?? 0,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
