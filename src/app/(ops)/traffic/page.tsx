"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { Sparkline } from "@/components/ops/Sparkline";
import { apiGet } from "@/components/ops/usePolling";

type Summary = {
  range: string;
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

type AppRow = { name: string; kind: string; rx: number; tx: number; containers: string[] };

type Payload = {
  summary: Summary;
  live: { ts: number; rxBps: number; txBps: number } | null;
  ifaces: { iface: string; rx: number; tx: number }[];
  apps: AppRow[];
  events: { id: string; ts: number; kind: string; detail: string }[];
  thresholds: { downBps: number; upBps: number; dailyBytes: number };
};

const RANGES: { key: string; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "24h", label: "24 小时" },
  { key: "7d", label: "7 天" },
  { key: "30d", label: "30 天" },
  { key: "90d", label: "90 天" },
  { key: "month", label: "按月" },
  { key: "year", label: "近一年" },
];

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtRate(bps: number): string {
  return `${fmtBytes(bps)}/s`;
}

export default function TrafficPage() {
  const [range, setRange] = useState("24h");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Payload>(`/api/traffic?range=${range}`);
      setData(d);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const s = data?.summary;

  return (
    <OpsShell
      title="流量统计"
      description="网卡采样、分层保留与软件流量排行"
      actions={
        <>
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={`btn px-2 py-1 text-xs ${range === r.key ? "btn-primary" : ""}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => void load()}>
            刷新
          </button>
        </>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}
      {!s ? (
        <div className="card p-8 text-center text-muted">加载中…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">实时下行</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {data?.live ? fmtRate(data.live.rxBps) : "—"}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">实时上行</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {data?.live ? fmtRate(data.live.txBps) : "—"}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">区间累计</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtBytes(s.rxBytes + s.txBytes)}</div>
              <div className="mt-0.5 text-xs text-muted">
                ↓ {fmtBytes(s.rxBytes)} · ↑ {fmtBytes(s.txBytes)}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">日均下行</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtRate(s.avgDownBps)}</div>
              <div className="mt-0.5 text-xs text-muted">P95 下行 {fmtRate(s.p95Bps.rx)}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">下行速率趋势（{s.granularity}）</h2>
              <Sparkline
                points={s.series.map((p) => ({ t: p.ts, v: p.rx }))}
                width={540}
                height={100}
                color="rgb(var(--c-accent))"
                label="下行"
              />
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">上行速率趋势</h2>
              <Sparkline
                points={s.series.map((p) => ({ t: p.ts, v: p.tx }))}
                width={540}
                height={100}
                color="rgb(var(--c-primary))"
                label="上行"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">峰值与分位</h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">峰值时刻</dt>
                  <dd className="tabular-nums">
                    {s.peak ? new Date(s.peak.ts).toLocaleString("zh-CN", { hour12: false }) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">峰值下行 / 上行</dt>
                  <dd className="tabular-nums">
                    {s.peak ? `${fmtRate(s.peak.rxBps)} / ${fmtRate(s.peak.txBps)}` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">P95（5 分钟桶）下行</dt>
                  <dd className="tabular-nums">{fmtRate(s.p95Bps.rx)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">P95（5 分钟桶）上行</dt>
                  <dd className="tabular-nums">{fmtRate(s.p95Bps.tx)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">日均上行</dt>
                  <dd className="tabular-nums">{fmtRate(s.avgUpBps)}</dd>
                </div>
              </dl>
            </div>

            <div className="card overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-semibold">网卡明细</h2>
              <table className="w-full text-sm">
                <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">接口</th>
                    <th className="px-3 py-2">接收</th>
                    <th className="px-3 py-2">发送</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.ifaces ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted">
                        区间内无网卡数据
                      </td>
                    </tr>
                  ) : (
                    (data?.ifaces ?? []).map((i) => (
                      <tr key={i.iface} className="border-t border-border">
                        <td className="px-3 py-2">{i.iface}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtBytes(i.rx)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtBytes(i.tx)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold">软件流量排行（按 Compose 项目归并）</h2>
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">接收</th>
                  <th className="px-3 py-2">发送</th>
                  <th className="px-3 py-2">容器</th>
                </tr>
              </thead>
              <tbody>
                {(data?.apps ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted">
                      Docker 未接入或暂无容器网络数据
                    </td>
                  </tr>
                ) : (
                  (data?.apps ?? []).map((a, i) => (
                    <tr key={`${a.kind}-${a.name}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{a.name}</td>
                      <td className="px-3 py-2 text-xs text-muted">{a.kind === "compose" ? "Compose 项目" : "独立容器"}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtBytes(a.rx)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtBytes(a.tx)}</td>
                      <td className="px-3 py-2 text-xs text-muted">{a.containers.join(", ")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold">阈值事件</h2>
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">详情</th>
                </tr>
              </thead>
              <tbody>
                {(data?.events ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted">
                      暂无阈值事件
                    </td>
                  </tr>
                ) : (
                  (data?.events ?? []).map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs text-muted">
                        {new Date(e.ts).toLocaleString("zh-CN", { hour12: false })}
                      </td>
                      <td className="px-3 py-2">{e.kind}</td>
                      <td className="px-3 py-2 text-xs text-muted">{e.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </OpsShell>
  );
}
