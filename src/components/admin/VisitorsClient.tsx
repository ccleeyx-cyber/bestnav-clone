"use client";

import { useEffect, useState } from "react";
import { api } from "./client";

interface Summary {
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
    ip_hash: string;
    ua_family: string;
    device: string;
    referrer: string;
  }[];
}

type Range = "today" | "7d" | "30d";

const RANGE_LABEL: Record<Range, string> = {
  today: "今日",
  "7d": "近 7 日",
  "30d": "近 30 日",
};

export default function VisitorsClient() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Summary>(`/api/visitors?range=${range}`).then((res) => {
      if (!alive) return;
      if (!res.ok) setError(res.error ?? "加载失败");
      else if (res.data) {
        setData(res.data);
        setError("");
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [range]);

  const empty = !loading && data && data.totalPv === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            className={range === r ? "btn btn-primary" : "btn"}
            onClick={() => setRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}
      {loading ? <div className="card p-6 text-sm text-muted">加载中…</div> : null}
      {empty ? (
        <div className="card p-6 text-sm text-muted">
          暂无访客数据。埋点在 src/middleware.ts 中采集（首次页面访问后才会出现记录）。
        </div>
      ) : null}

      {data && data.totalPv > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="今日 PV" value={data.todayPv} />
            <Stat label="今日 UV" value={data.todayUv} />
            <Stat label="总访问量" value={data.totalPv} />
            <Stat label="独立访客" value={data.totalUv} />
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">
              访问趋势（{RANGE_LABEL[range]}）
            </h2>
            <TrendChart points={data.trend} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">24 小时活跃分布</h2>
              <HourChart bars={data.hours} />
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">访问来源</h2>
              <NameList rows={data.referrers} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">终端占比</h2>
              <NameList rows={data.devices} />
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">浏览器占比</h2>
              <NameList rows={data.browsers} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">热门页面 Top 5</h2>
              <NameList rows={data.topPages} emptyText="暂无页面访问记录" />
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">被点最多的导航条目 Top 5</h2>
              <NameList
                rows={data.topLinks}
                emptyText="暂无 bookmark.open 审计记录"
              />
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="px-3 py-3 text-sm font-semibold">访客明细（最近 {data.recent.length} 条）</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-y border-border">
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">路径</th>
                  <th className="px-3 py-2 font-medium">访客指纹</th>
                  <th className="px-3 py-2 font-medium">浏览器</th>
                  <th className="px-3 py-2 font-medium">设备</th>
                  <th className="px-3 py-2 font-medium">来源</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted" colSpan={6}>
                      暂无明细
                    </td>
                  </tr>
                ) : (
                  data.recent.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {new Date(r.ts).toLocaleString()}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2">{r.path}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">
                        {masked(r.ip_hash)}
                      </td>
                      <td className="px-3 py-2">{r.ua_family || "未知"}</td>
                      <td className="px-3 py-2">{r.device || "未知"}</td>
                      <td className="px-3 py-2 text-muted">{r.referrer || "直接访问"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** ip_hash 形如 "<sha256>|<脱敏IP>"，页面只展示脱敏部分。 */
function masked(stored: string): string {
  if (!stored) return "未知";
  const i = stored.indexOf("|");
  if (i < 0) return `${stored.slice(0, 8)}…`;
  return stored.slice(i + 1) || "未知";
}

function Stat({ label, value }: { label: string; value: number }) {  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TrendChart({ points }: { points: { date: string; pv: number; uv: number }[] }) {
  if (!points.length) return <p className="text-sm text-muted">暂无数据</p>;
  const w = 640;
  const h = 160;
  const pad = 20;
  const max = Math.max(1, ...points.map((p) => p.pv), ...points.map((p) => p.uv));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = (v: number, i: number) => [
    pad + i * step,
    h - pad - (v / max) * (h - pad * 2),
  ];
  const path = (key: "pv" | "uv") =>
    points
      .map((p, i) => {
        const [x, y] = xy(p[key], i);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="访问趋势">
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="rgb(var(--c-border))"
          strokeWidth={1}
        />
        <path d={path("pv")} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={2} />
        <path d={path("uv")} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={2} strokeDasharray="4 3" />
        {points.map((p, i) => {
          const [x, y] = xy(p.pv, i);
          return <circle key={p.date} cx={x} cy={y} r={2.5} fill="rgb(var(--c-primary))" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{points[0]?.date}</span>
        <span className="flex gap-3">
          <span className="text-primary">— PV</span>
          <span className="text-accent">-- UV</span>
        </span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function HourChart({ bars }: { bars: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="flex h-40 items-end gap-[3px]">
      {bars.map((b) => (
        <div key={b.hour} className="group flex-1" title={`${b.hour}:00 · ${b.count}`}>
          <div
            className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary"
            style={{ height: `${Math.max(2, (b.count / max) * 140)}px` }}
          />
          <div className="mt-1 text-center text-[10px] text-muted">{b.hour}</div>
        </div>
      ))}
    </div>
  );
}

function NameList({
  rows,
  emptyText = "暂无数据",
}: {
  rows: { name: string; count: number }[];
  emptyText?: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{r.name || "未知"}</span>
            <span className="tabular-nums text-muted">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
