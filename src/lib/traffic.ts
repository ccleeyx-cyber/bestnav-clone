/**
 * Network traffic accounting.
 *
 * A single process-wide sampler collects cumulative NIC byte counters every
 * 60s, converts them to per-minute deltas and stores them in `traffic_samples`
 * with granularity='minute'.
 *
 * Retention (hierarchical roll-up):
 *   minute -> keep 48h  (rolled up into hour buckets)
 *   hour   -> keep 90d  (rolled up into day buckets)
 *   day    -> keep 366d (then deleted)
 */
import { getJSON, now, rows, run, uid } from "./db";
import { collectHostSnapshot, isNoiseIface } from "./sysinfo";
import { composeProject, dockerConfigured, listContainers, containerStats } from "./docker";

export type TrafficSample = {
  id: number;
  ts: number;
  rx_bytes: number;
  tx_bytes: number;
  iface: string;
  granularity: "minute" | "hour" | "day";
};

export const MINUTE_MS = 60_000;
const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;

const KEEP_MINUTE_MS = 48 * HOUR_MS;
const KEEP_HOUR_MS = 90 * DAY_MS;
const KEEP_DAY_MS = 366 * DAY_MS;

/* ------------------------------ settings ------------------------------ */

export type TrafficThresholds = {
  downBps: number; // bytes/s
  upBps: number;
  dailyBytes: number;
};

export function getThresholds(): TrafficThresholds {
  return getJSON<TrafficThresholds>("traffic.thresholds", {
    downBps: 0,
    upBps: 0,
    dailyBytes: 0,
  });
}

export function setThresholds(t: TrafficThresholds): void {
  run(
    "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    "traffic.thresholds",
    JSON.stringify({
      downBps: Math.max(0, Math.floor(t.downBps || 0)),
      upBps: Math.max(0, Math.floor(t.upBps || 0)),
      dailyBytes: Math.max(0, Math.floor(t.dailyBytes || 0)),
    }),
    now(),
  );
}

/* ------------------------------- sampler ------------------------------ */

type Counter = { rx: number; tx: number };
let lastCounters: Map<string, Counter> | null = null;
let timer: NodeJS.Timeout | null = null;

export function ensureSampler(): void {
  if (timer) return;
  const sec = Math.max(15, Number(getJSON<number>("traffic.sampleSec", 60)) || 60);
  timer = setInterval(() => {
    void sample().catch(() => undefined);
  }, sec * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

export function samplerRunning(): boolean {
  return timer !== null;
}

export async function sample(): Promise<{ ts: number; rx: number; tx: number }[]> {
  const snap = await collectHostSnapshot();
  const counters = new Map<string, Counter>();
  for (const i of snap.net.iface) {
    if (isNoiseIface(i.name)) continue;
    counters.set(i.name, { rx: i.rx, tx: i.tx });
  }

  const ts = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
  const written: { ts: number; rx: number; tx: number }[] = [];

  if (lastCounters) {
    for (const [iface, cur] of counters) {
      const prev = lastCounters.get(iface);
      if (!prev) continue;
      const rx = Math.max(0, cur.rx - prev.rx);
      const tx = Math.max(0, cur.tx - prev.tx);
      if (rx === 0 && tx === 0) continue;
      insertSample(ts, iface, rx, tx, "minute");
      written.push({ ts, rx, tx });
    }
  }
  lastCounters = counters;

  void rollup();
  void checkThresholds(written).catch(() => undefined);
  return written;
}

export function insertSample(ts: number, iface: string, rx: number, tx: number, granularity: string): void {
  run(
    "INSERT INTO traffic_samples(ts, rx_bytes, tx_bytes, iface, granularity) VALUES(?,?,?,?,?)",
    ts,
    Math.round(rx),
    Math.round(tx),
    iface,
    granularity,
  );
}

/* ------------------------------- rollup ------------------------------- */

export function rollup(): void {
  const nowTs = Date.now();

  // minute -> hour
  const minuteCut = nowTs - KEEP_MINUTE_MS;
  const minuteRows = allSamples("minute", minuteCut);
  if (minuteRows.length) {
    const buckets = new Map<string, { ts: number; rx: number; tx: number }>();
    for (const r of minuteRows) {
      const hourTs = Math.floor(r.ts / HOUR_MS) * HOUR_MS;
      const key = `${hourTs}|${r.iface}`;
      const b = buckets.get(key) ?? { ts: hourTs, rx: 0, tx: 0 };
      b.rx += r.rx_bytes;
      b.tx += r.tx_bytes;
      buckets.set(key, b);
    }
    for (const b of buckets.values()) insertSample(b.ts, "", b.rx, b.tx, "hour");
    const ids = minuteRows.map((r) => r.id);
    deleteByIds(ids);
  }

  // hour -> day
  const hourCut = nowTs - KEEP_HOUR_MS;
  const hourRows = allSamples("hour", hourCut);
  if (hourRows.length) {
    const buckets = new Map<number, { rx: number; tx: number }>();
    for (const r of hourRows) {
      const dayTs = Math.floor(r.ts / DAY_MS) * DAY_MS;
      const b = buckets.get(dayTs) ?? { rx: 0, tx: 0 };
      b.rx += r.rx_bytes;
      b.tx += r.tx_bytes;
      buckets.set(dayTs, b);
    }
    for (const [dayTs, b] of buckets) insertSample(dayTs, "", b.rx, b.tx, "day");
    deleteByIds(hourRows.map((r) => r.id));
  }

  // day -> delete
  const dayCut = nowTs - KEEP_DAY_MS;
  run("DELETE FROM traffic_samples WHERE granularity='day' AND ts < ?", dayCut);
}

function allSamples(granularity: string, beforeTs: number): TrafficSample[] {
  return rows<TrafficSample>(
    "SELECT * FROM traffic_samples WHERE granularity=? AND ts < ? ORDER BY ts ASC",
    granularity,
    beforeTs,
  );
}

function deleteByIds(ids: number[]): void {
  if (!ids.length) return;
  const chunk = 400;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const marks = part.map(() => "?").join(",");
    run(`DELETE FROM traffic_samples WHERE id IN (${marks})`, ...part);
  }
}

/* ------------------------------- queries ------------------------------- */

export type RangeKey = "today" | "24h" | "7d" | "30d" | "90d" | "month" | "year" | "all";

export function rangeStart(key: RangeKey): number {
  const t = Date.now();
  const d = new Date(t);
  switch (key) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "24h":
      return t - DAY_MS;
    case "7d":
      return t - 7 * DAY_MS;
    case "30d":
      return t - 30 * DAY_MS;
    case "90d":
      return t - 90 * DAY_MS;
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    default:
      return 0;
  }
}

/** Resolve the granularity used to answer a query for the given range. */
export function granularityFor(key: RangeKey): "minute" | "hour" | "day" {
  if (key === "today" || key === "24h") return "minute";
  if (key === "7d" || key === "30d") return "hour";
  return "day";
}

export type TrafficSummary = {
  range: RangeKey;
  from: number;
  to: number;
  granularity: string;
  rxBytes: number;
  txBytes: number;
  peak: { ts: number; rxBps: number; txBps: number } | null;
  p95Bps: { rx: number; tx: number };
  avgDownBps: number;
  avgUpBps: number;
  series: { ts: number; rx: number; tx: number }[];
};

export function summarize(key: RangeKey): TrafficSummary {
  const from = rangeStart(key);
  const gran = granularityFor(key);
  const raw = querySamples(from, Date.now(), gran);
  const series = raw.map((r) => ({ ts: r.ts, rx: r.rx_bytes, tx: r.tx_bytes }));
  const rxBytes = series.reduce((a, b) => a + b.rx, 0);
  const txBytes = series.reduce((a, b) => a + b.tx, 0);

  // per-bucket rates: byte counts represent one bucket interval
  const bucketMs = gran === "minute" ? MINUTE_MS : gran === "hour" ? HOUR_MS : DAY_MS;
  const buckets = series.map((s) => ({ ts: s.ts, rxBps: (s.rx / bucketMs) * 1000, txBps: (s.tx / bucketMs) * 1000 }));
  const peak = buckets.length
    ? buckets.reduce((m, b) =>
        b.rxBps + b.txBps > m.rxBps + m.txBps ? b : m,
      )
    : null;

  // 95th percentile over 5-minute buckets (from minute data when available)
  const p95 = percentile95(series);

  const spanMs = Math.max(MINUTE_MS, Date.now() - from);
  const avgDownBps = (rxBytes / spanMs) * 1000;
  const avgUpBps = (txBytes / spanMs) * 1000;

  return {
    range: key,
    from,
    to: Date.now(),
    granularity: gran,
    rxBytes,
    txBytes,
    peak: peak ? { ts: peak.ts, rxBps: peak.rxBps, txBps: peak.txBps } : null,
    p95Bps: p95,
    avgDownBps,
    avgUpBps,
    series,
  };
}

function querySamples(from: number, to: number, granularity: string): TrafficSample[] {
  const all = rows<TrafficSample>(
    "SELECT ts, SUM(rx_bytes) AS rx_bytes, SUM(tx_bytes) AS tx_bytes FROM traffic_samples WHERE ts >= ? AND ts <= ? AND (granularity = ? OR granularity='minute') GROUP BY ts ORDER BY ts ASC",
    from,
    to,
    granularity,
  );
  return all;
}

/** 95th percentile of the 5-minute bucketed throughput. */
export function percentile95(series: { ts: number; rx: number; tx: number }[]): { rx: number; tx: number } {
  const buckets = new Map<number, { rx: number; tx: number }>();
  for (const s of series) {
    const b = Math.floor(s.ts / (5 * MINUTE_MS)) * (5 * MINUTE_MS);
    const cur = buckets.get(b) ?? { rx: 0, tx: 0 };
    cur.rx += s.rx;
    cur.tx += s.tx;
    buckets.set(b, cur);
  }
  if (!buckets.size) return { rx: 0, tx: 0 };
  const rxArr = [...buckets.values()].map((b) => b.rx / (5 * MINUTE_MS)).sort((a, b) => a - b);
  const txArr = [...buckets.values()].map((b) => b.tx / (5 * MINUTE_MS)).sort((a, b) => a - b);
  const pick = (arr: number[]) => {
    const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil(arr.length * 0.95) - 1));
    return Math.round(arr[idx] * 100) / 100;
  };
  return { rx: pick(rxArr), tx: pick(txArr) };
}

/** Live rate derived from the two most recent minute samples. */
export function liveRate(): { ts: number; rxBps: number; txBps: number } | null {
  const r = rows<{ ts: number; rx: number; tx: number }>(
    "SELECT ts, SUM(rx_bytes) AS rx, SUM(tx_bytes) AS tx FROM traffic_samples WHERE granularity='minute' GROUP BY ts ORDER BY ts DESC LIMIT 2",
  );
  if (!r.length) return null;
  const last = r[0];
  const rxBps = Math.round((last.rx / MINUTE_MS) * 1000);
  const txBps = Math.round((last.tx / MINUTE_MS) * 1000);
  return { ts: last.ts, rxBps, txBps };
}

/** Per-interface breakdown for the current window. */
export function ifaceBreakdown(from: number): { iface: string; rx: number; tx: number }[] {
  const r = rows<{ iface: string; rx: number; tx: number }>(
    "SELECT iface, SUM(rx_bytes) AS rx, SUM(tx_bytes) AS tx FROM traffic_samples WHERE ts >= ? AND granularity='minute' AND iface <> '' GROUP BY iface ORDER BY (rx+tx) DESC",
    from,
  );
  return r;
}

/* ------------------------- software ranking ------------------------- */

export type AppTraffic = {
  name: string;
  kind: "compose" | "container";
  rx: number;
  tx: number;
  containers: string[];
};

/**
 * Rank software by container network traffic, merging containers that share
 * a Docker Compose project label.
 */
export async function softwareRanking(): Promise<AppTraffic[]> {
  if (!dockerConfigured()) return [];
  let containers;
  try {
    containers = await listContainers();
  } catch {
    return [];
  }
  const groups = new Map<string, AppTraffic>();
  for (const c of containers) {
    let stats;
    try {
      stats = await containerStats(c.Id);
    } catch {
      continue;
    }
    const project = composeProject(c);
    const key = project ? `compose:${project}` : `container:${c.Id}`;
    const name = project ?? (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, "");
    const g = groups.get(key) ?? { name, kind: project ? "compose" : "container", rx: 0, tx: 0, containers: [] };
    g.rx += stats.netRx;
    g.tx += stats.netTx;
    g.containers.push((c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, ""));
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
}

/* ------------------------------ events ------------------------------ */

export function recordEvent(kind: string, detail: unknown): void {
  run(
    "INSERT INTO traffic_events(id, ts, kind, detail) VALUES(?,?,?,?)",
    uid("te_"),
    Date.now(),
    kind,
    JSON.stringify(detail),
  );
}

export function listEvents(limit = 50): { id: string; ts: number; kind: string; detail: string }[] {
  return rows(
    "SELECT id, ts, kind, detail FROM traffic_events ORDER BY ts DESC LIMIT ?",
    limit,
  );
}

async function checkThresholds(written: { ts: number; rx: number; tx: number }[]): Promise<void> {
  if (!written.length) return;
  const th = getThresholds();
  const rxBps = written.reduce((a, b) => a + b.rx, 0) / MINUTE_MS * 1000;
  const txBps = written.reduce((a, b) => a + b.tx, 0) / MINUTE_MS * 1000;
  if (th.downBps > 0 && rxBps > th.downBps) {
    recordEvent("down_exceeded", { rxBps, limit: th.downBps });
  }
  if (th.upBps > 0 && txBps > th.upBps) {
    recordEvent("up_exceeded", { txBps, limit: th.upBps });
  }
  if (th.dailyBytes > 0) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const r = rows<{ total: number }>(
      "SELECT SUM(rx_bytes + tx_bytes) AS total FROM traffic_samples WHERE ts >= ?",
      dayStart.getTime(),
    );
    const total = r[0]?.total ?? 0;
    if (total > th.dailyBytes) {
      recordEvent("daily_exceeded", { total, limit: th.dailyBytes });
    }
  }
}
