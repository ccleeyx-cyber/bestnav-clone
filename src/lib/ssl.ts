/**
 * SSL certificate inspection.
 * Connects with node:tls, reads the peer certificate, computes days_left
 * and a 0..100 health score (linear decay from 100 at >90 days to 0 at expiry).
 */
import tls from "node:tls";
import { getJSON, now, one, rows, run, uid } from "./db";

export type SslRecord = {
  id: string;
  domain: string;
  issuer: string;
  not_before: string | null;
  not_after: string | null;
  days_left: number | null;
  health: number | null;
  last_checked_at: string | null;
  history: string;
};

export type SslCheckResult = {
  domain: string;
  ok: boolean;
  issuer?: string;
  subject?: string;
  not_before?: string;
  not_after?: string;
  days_left?: number;
  health?: number;
  error?: string;
};

export function healthScore(daysLeft: number): number {
  if (daysLeft < 0) return 0;
  if (daysLeft > 90) return 100;
  return Math.max(0, Math.round((daysLeft / 90) * 100));
}

export function checkDomain(domain: string, timeoutMs = 8000): Promise<SslCheckResult> {
  const host = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const port = 443;
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: SslCheckResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        if (!cert || !cert.valid_to) {
          done({ domain, ok: false, error: "未取得对端证书" });
          return;
        }
        const notAfter = new Date(cert.valid_to);
        const notBefore = new Date(cert.valid_from);
        const daysLeft = Math.floor((notAfter.getTime() - Date.now()) / 86400000);
        const issuer =
          (cert.issuer?.O as string) ||
          (cert.issuer?.CN as string) ||
          (cert.issuer as unknown as string) ||
          "";
        done({
          domain,
          ok: true,
          issuer,
          subject: (cert.subject?.CN as string) || "",
          not_before: notBefore.toISOString(),
          not_after: notAfter.toISOString(),
          days_left: daysLeft,
          health: healthScore(daysLeft),
        });
      },
    );
    socket.once("error", (err) => done({ domain, ok: false, error: String(err.message ?? err) }));
    socket.once("timeout", () => done({ domain, ok: false, error: "连接超时" }));
  });
}

/* --------------------------- watched domains --------------------------- */

export type WatchedDomain = { domain: string; label?: string; enabled?: boolean };

const SETTING_KEY = "ssl.watchlist";

export function getWatchlist(): WatchedDomain[] {
  return getJSON<WatchedDomain[]>(SETTING_KEY, []);
}

export function setWatchlist(list: WatchedDomain[]): void {
  const clean = list
    .map((d) => ({ domain: String(d.domain ?? "").trim(), label: d.label ?? "", enabled: d.enabled !== false }))
    .filter((d) => d.domain.length > 0);
  run(
    "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    SETTING_KEY,
    JSON.stringify(clean),
    now(),
  );
}

export function listCerts(): SslRecord[] {
  return rows<SslRecord>("SELECT * FROM ssl_certs ORDER BY COALESCE(days_left, 9999) ASC");
}

export function upsertCert(result: SslCheckResult): void {
  const existing = one<{ id: string; history: string }>(
    "SELECT id, history FROM ssl_certs WHERE domain = ?",
    result.domain,
  );
  const history: { ts: string; days_left: number; health: number }[] = existing ? parseHistory(existing.history) : [];
  if (result.ok && typeof result.days_left === "number") {
    history.push({ ts: now(), days_left: result.days_left, health: result.health ?? healthScore(result.days_left) });
  }
  // keep 90 days of history
  const cutoff = Date.now() - 90 * 86400000;
  const kept = history.filter((h) => new Date(h.ts).getTime() >= cutoff).slice(-500);

  const ts = now();
  if (existing) {
    run(
      `UPDATE ssl_certs SET issuer=?, not_before=?, not_after=?, days_left=?, health=?, last_checked_at=?, history=?
       WHERE id=?`,
      result.issuer ?? "",
      result.not_before ?? null,
      result.not_after ?? null,
      result.days_left ?? null,
      result.health ?? null,
      ts,
      JSON.stringify(kept),
      existing.id,
    );
  } else {
    run(
      `INSERT INTO ssl_certs(id, domain, issuer, not_before, not_after, days_left, health, last_checked_at, history)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      uid("ssl_"),
      result.domain,
      result.issuer ?? "",
      result.not_before ?? null,
      result.not_after ?? null,
      result.days_left ?? null,
      result.health ?? null,
      ts,
      JSON.stringify(kept),
    );
  }
}

export function parseHistory(raw: string | null | undefined): { ts: string; days_left: number; health: number }[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ---------------------------- scheduler ---------------------------- */

let timer: NodeJS.Timeout | null = null;

/**
 * Process-wide singleton scheduler — one interval for the whole app.
 * Batch inspection runs on the configured interval (default 6h).
 */
export function ensureScheduler(): void {
  if (timer) return;
  const intervalSec = Math.max(
    60,
    Number(getJSON<number>("ssl.intervalSec", 6 * 3600)) || 6 * 3600,
  );
  timer = setInterval(() => {
    void runBatch().catch(() => undefined);
  }, intervalSec * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

export function schedulerRunning(): boolean {
  return timer !== null;
}

export async function runBatch(): Promise<SslCheckResult[]> {
  const list = getWatchlist().filter((d) => d.enabled !== false);
  const results: SslCheckResult[] = [];
  for (const item of list) {
    const r = await checkDomain(item.domain);
    upsertCert(r);
    results.push(r);
  }
  return results;
}
