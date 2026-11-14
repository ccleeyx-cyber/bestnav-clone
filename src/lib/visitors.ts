/**
 * 访客统计。
 *
 * 隐私约束：**绝不存原始 IP**。只存 IP 的 sha256（用于 UV 去重），IP 展示时按段脱敏（1.2.*.*）。
 * 数据来源：src/instrumentation.ts 在每次页面访问时调用 recordVisit()。
 */
import { createHash } from "node:crypto";
import { rows, one, run } from "@/lib/db";

export interface VisitRow {
  id: number;
  ts: number;
  path: string;
  ip_hash: string | null;
  ua_family: string;
  device: string;
  referrer: string;
  country: string;
}

/** IP 的 sha256（带固定盐，避免彩虹表反查）。 */
export function hashIp(ip: string): string {
  if (!ip) return "";
  const salt = process.env.BESTNAV_SECRET ?? "bestnav-clone-dev-secret-change-me";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

/**
 * visitor_stats.ip_hash 的存储格式：`<sha256hex>|<脱敏IP>`。
 * 只有 hash 部分参与 UV 去重；脱敏部分仅用于页面展示（1.2.*.*）。
 * 这样既不存原始 IP，也能在明细里按段脱敏显示。
 */
export function packIpHash(hash: string, masked: string): string {
  return `${hash}|${masked}`;
}

export function unpackIpHash(stored: string): { hash: string; masked: string } {
  const i = stored.indexOf("|");
  if (i < 0) return { hash: stored, masked: "" };
  return { hash: stored.slice(0, i), masked: stored.slice(i + 1) };
}

/** 把 IP 按段脱敏：1.2.3.4 → 1.2.*.*；IPv6 只留前两段。 */
export function maskIp(ip: string): string {
  if (!ip) return "未知";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts[0]}:${parts[1] ?? ""}:*`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return "未知";
  return `${parts[0]}.${parts[1]}.*.*`;
}

/* ------------------------------------------------------------------ */
/* UA 解析（简单启发式，绝不编造）                                      */
/* ------------------------------------------------------------------ */

export interface UaInfo {
  family: string;
  device: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
}

export function parseUa(ua: string): UaInfo {
  const s = (ua ?? "").toLowerCase();
  if (!s) return { family: "未知", device: "unknown" };
  if (/bot|crawler|spider|slurp|bingpreview|headlesschrome/.test(s)) {
    return { family: "爬虫/机器人", device: "bot" };
  }
  const browsers: [RegExp, string][] = [
    [/edg[ea]?\//, "Edge"],
    [/opr\/|opera/, "Opera"],
    [/samsungbrowser/, "Samsung Internet"],
    [/fxios/, "Firefox"],
    [/chrome\//, "Chrome"],
    [/safari\//, "Safari"],
    [/msie |trident/, "IE"],
  ];
  let family = "其他";
  for (const [re, name] of browsers) {
    if (re.test(s)) {
      family = name;
      break;
    }
  }
  let device: UaInfo["device"] = "desktop";
  if (/ipad|tablet|playbook|silk/.test(s)) device = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) device = "mobile";
  return { family, device };
}

/** 来源归类：UA/Referer 无法可靠判断地区，所以只做「直接访问 / 搜索引擎 / 站内 / 外部链接」。 */
export function classifyReferrer(ref: string, host?: string): string {
  const r = (ref ?? "").trim();
  if (!r) return "直接访问";
  let url: URL;
  try {
    url = new URL(r);
  } catch {
    return "直接访问";
  }
  const searchEngines = [
    "google.",
    "bing.",
    "baidu.",
    "duckduckgo.",
    "yandex.",
    "so.com",
    "sogou.",
    "yahoo.",
    "ecosia.",
    "brave.",
  ];
  if (searchEngines.some((s) => url.hostname.includes(s))) return "搜索引擎";
  if (host && url.hostname === host) return "站内跳转";
  return "外部链接";
}

/* ------------------------------------------------------------------ */
/* 记录                                                                */
/* ------------------------------------------------------------------ */

/** 记录一次页面访问。返回是否成功写入。 */
export function recordVisit(opts: {
  path: string;
  ip: string;
  ua: string;
  referrer?: string;
  host?: string;
}): boolean {
  try {
    const { family, device } = parseUa(opts.ua);
    const referrer = classifyReferrer(opts.referrer ?? "", opts.host);
    const ts = Date.now();
    run(
      "INSERT INTO visitor_stats(ts, path, ip_hash, ua_family, device, referrer, country) VALUES(?,?,?,?,?,?,?)",
      ts,
      opts.path.slice(0, 300),
      packIpHash(hashIp(opts.ip), maskIp(opts.ip)),
      family,
      device,
      referrer,
      "", // country 留空：无法可靠判断，不编造
    );    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 统计查询                                                            */
/* ------------------------------------------------------------------ */

export interface VisitorSummary {
  todayPv: number;
  todayUv: number;
  totalPv: number;
  totalUv: number;
  trend: { date: string; pv: number; uv: number }[];
  hours: { hour: number; count: number }[];
  referrers: { name: string; count: number }[];
  devices: { name: string; count: number }[];
  browsers: { name: string; count: number }[];
  topPages: { name: string; count: number }[];
  topLinks: { name: string; count: number }[];
  recent: {
    id: number;
    ts: number;
    path: string;
    ipHash: string;
    ua_family: string;
    device: string;
    referrer: string;
  }[];
}

export type TrendRange = "today" | "7d" | "30d";

function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupCount(sql: string, ...params: unknown[]) {
  return rows<{ name: string; count: number }>(sql, ...params);
}

export function summarize(range: TrendRange = "today", limit = 200): VisitorSummary {
  const todayStart = startOfToday();
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;

  const todayPv =
    one<{ n: number }>("SELECT COUNT(*) AS n FROM visitor_stats WHERE ts >= ?", todayStart)?.n ?? 0;
  const todayUv =
    one<{ n: number }>(
      "SELECT COUNT(DISTINCT substr(ip_hash,1,64)) AS n FROM visitor_stats WHERE ts >= ?",
      todayStart,
    )?.n ?? 0;
  const totalPv = one<{ n: number }>("SELECT COUNT(*) AS n FROM visitor_stats")?.n ?? 0;
  const totalUv =
    one<{ n: number }>("SELECT COUNT(DISTINCT substr(ip_hash,1,64)) AS n FROM visitor_stats")?.n ?? 0;

  // 趋势
  const trendMap = new Map<string, { pv: number; uv: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const ts = todayStart - i * 86400000;
    trendMap.set(dayKey(ts), { pv: 0, uv: 0 });
  }
  const trendRows = rows<{ day: string; pv: number; uv: number }>(
    `SELECT date(ts/1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS pv, COUNT(DISTINCT substr(ip_hash,1,64)) AS uv
     FROM visitor_stats WHERE ts >= ? GROUP BY day`,
    todayStart - (days - 1) * 86400000,
  );
  for (const r of trendRows) {
    const cur = trendMap.get(r.day);
    if (cur) {
      cur.pv = r.pv;
      cur.uv = r.uv;
    }
  }
  const trend = [...trendMap.entries()].map(([date, v]) => ({ date, ...v }));

  // 24 小时分布（最近 24 小时）
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  const hourRows = rows<{ hour: number; count: number }>(
    `SELECT CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INTEGER) AS hour, COUNT(*) AS count
     FROM visitor_stats WHERE ts >= ? GROUP BY hour`,
    Date.now() - 24 * 3600 * 1000,
  );
  for (const r of hourRows) {
    if (r.hour >= 0 && r.hour < 24) hours[r.hour].count = r.count;
  }

  const referrers = groupCount(
    "SELECT referrer AS name, COUNT(*) AS count FROM visitor_stats GROUP BY referrer ORDER BY count DESC LIMIT 8",
  );
  const devices = groupCount(
    "SELECT device AS name, COUNT(*) AS count FROM visitor_stats GROUP BY device ORDER BY count DESC LIMIT 8",
  );
  const browsers = groupCount(
    "SELECT ua_family AS name, COUNT(*) AS count FROM visitor_stats GROUP BY ua_family ORDER BY count DESC LIMIT 10",
  );
  const topPages = groupCount(
    "SELECT path AS name, COUNT(*) AS count FROM visitor_stats GROUP BY path ORDER BY count DESC LIMIT 5",
  );
  // 被点最多的导航条目：来自审计日志 action='bookmark.open'
  const topLinks = groupCount(
    `SELECT target AS name, COUNT(*) AS count FROM audit_logs
     WHERE action = 'bookmark.open' AND target <> '' GROUP BY target ORDER BY count DESC LIMIT 5`,
  );

  const recent = rows<{
    id: number;
    ts: number;
    path: string;
    ip_hash: string;
    ua_family: string;
    device: string;
    referrer: string;
  }>(
    "SELECT id, ts, path, ip_hash, ua_family, device, referrer FROM visitor_stats ORDER BY ts DESC LIMIT ?",
    limit,
  ).map((r) => ({ ...r, ipHash: r.ip_hash }));

  return {
    todayPv,
    todayUv,
    totalPv,
    totalUv,
    trend,
    hours,
    referrers,
    devices,
    browsers,
    topPages,
    topLinks,
    recent,
  };
}

/** 最近一条访客记录里不含原始 IP；这里只返回脱敏后的展示值（需要外部传入明文 IP 才能脱敏）。 */
export function maskHash(hash: string): string {
  if (!hash) return "未知";
  return `${hash.slice(0, 8)}…`;
}

