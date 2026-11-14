"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { Sparkline } from "@/components/ops/Sparkline";
import { apiGet } from "@/components/ops/usePolling";

type Snapshot = {
  ts: number;
  platform: string;
  cpu: { model: string; cores: number; usagePct: number; loadAvg: number[] };
  mem: { total: number; used: number; free: number; usagePct: number };
  disk: { mount: string; total: number; used: number; free: number; usePct: number }[];
  net: { iface: { name: string; rx: number; tx: number }[]; rxTotal: number; txTotal: number };
  uptimeSec: number;
  temps: { label: string; celsius: number }[] | null;
  nodeVersion: string;
};

type Payload = { snapshot: Snapshot; history: Snapshot[] };

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export default function HostPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Payload>("/api/monitor/host");
      setData(d);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const s = data?.snapshot;
  const hist = data?.history ?? [];

  return (
    <OpsShell
      title="主机资源监控"
      description="CPU / 内存 / 磁盘 / 网络 / 运行时长 / 温度，最近 60 点趋势"
      actions={
        <button className="btn" onClick={() => void load()}>
          刷新
        </button>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}
      {!s ? (
        <div className="card p-8 text-center text-muted">采集中…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="CPU"
              value={`${s.cpu.usagePct}%`}
              sub={`${s.cpu.cores} 核 · ${s.cpu.model} · load ${s.cpu.loadAvg.map((n) => n.toFixed(2)).join(" / ")}`}
            />
            <Stat
              label="内存"
              value={`${s.mem.usagePct}%`}
              sub={`${fmtBytes(s.mem.used)} / ${fmtBytes(s.mem.total)}`}
            />
            <Stat
              label="运行时长"
              value={fmtUptime(s.uptimeSec)}
              sub={`${s.platform} · Node ${s.nodeVersion}`}
            />
            <Stat
              label="网络累计"
              value={fmtBytes(s.net.rxTotal + s.net.txTotal)}
              sub={`↓ ${fmtBytes(s.net.rxTotal)} · ↑ ${fmtBytes(s.net.txTotal)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">CPU 使用率趋势（最近 {hist.length} 点）</h2>
              <Sparkline
                points={hist.map((h) => ({ t: h.ts, v: h.cpu.usagePct }))}
                width={520}
                height={90}
                label="CPU 使用率"
              />
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">内存使用率趋势</h2>
              <Sparkline
                points={hist.map((h) => ({ t: h.ts, v: h.mem.usagePct }))}
                width={520}
                height={90}
                color="rgb(var(--c-accent))"
                label="内存使用率"
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold">磁盘</h2>
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">挂载点</th>
                  <th className="px-3 py-2">总量</th>
                  <th className="px-3 py-2">已用</th>
                  <th className="px-3 py-2">可用</th>
                  <th className="px-3 py-2">使用率</th>
                </tr>
              </thead>
              <tbody>
                {s.disk.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted">
                      无可用磁盘信息
                    </td>
                  </tr>
                ) : (
                  s.disk.map((d) => (
                    <tr key={d.mount} className="border-t border-border">
                      <td className="px-3 py-2">{d.mount}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtBytes(d.total)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtBytes(d.used)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtBytes(d.free)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-bg">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, d.usePct)}%`,
                                background: d.usePct > 85 ? "rgb(var(--c-err))" : "rgb(var(--c-ok))",
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-xs">{d.usePct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-semibold">网卡</h2>
              <table className="w-full text-sm">
                <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">接口</th>
                    <th className="px-3 py-2">接收</th>
                    <th className="px-3 py-2">发送</th>
                  </tr>
                </thead>
                <tbody>
                  {s.net.iface.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted">
                        无网卡信息
                      </td>
                    </tr>
                  ) : (
                    s.net.iface.map((i) => (
                      <tr key={i.name} className="border-t border-border">
                        <td className="px-3 py-2">{i.name}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtBytes(i.rx)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtBytes(i.tx)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">温度</h2>
              {!s.temps ? (
                <p className="text-sm text-muted">当前环境无法读取温度传感器（已降级为不可用）。</p>
              ) : (
                <ul className="space-y-2">
                  {s.temps.map((t) => (
                    <li key={t.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{t.label}</span>
                      <span
                        className={`tabular-nums ${t.celsius > 80 ? "text-err" : t.celsius > 65 ? "text-warn" : "text-ok"}`}
                      >
                        {t.celsius} °C
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </OpsShell>
  );
}
