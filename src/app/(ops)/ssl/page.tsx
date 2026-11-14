"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { Sparkline } from "@/components/ops/Sparkline";
import { apiGet, apiSend } from "@/components/ops/usePolling";

type Cert = {
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

type Payload = {
  certs: Cert[];
  watchlist: { domain: string; label?: string; enabled?: boolean }[];
  intervalSec: number;
};

function healthColor(h: number | null): string {
  if (h === null) return "rgb(var(--c-muted))";
  if (h >= 70) return "rgb(var(--c-ok))";
  if (h >= 30) return "rgb(var(--c-warn))";
  return "rgb(var(--c-err))";
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function SslPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Payload>("/api/ssl");
      setData(d);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const addDomain = async () => {
    const domain = newDomain.trim();
    if (!domain) return;
    setBusy(true);
    try {
      const next = [...(data?.watchlist ?? []), { domain }];
      await apiSend("/api/ssl", "POST", { mode: "watchlist", domains: next });
      setNewDomain("");
      setMsg(`已加入巡检列表：${domain}`);
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeDomain = async (domain: string) => {
    setBusy(true);
    try {
      const next = (data?.watchlist ?? []).filter((d) => d.domain !== domain);
      await apiSend("/api/ssl", "POST", { mode: "watchlist", domains: next });
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runCheck = async () => {
    setBusy(true);
    setMsg("正在巡检…");
    try {
      const r = await apiSend<{ results: { ok: boolean; domain: string; error?: string }[] }>(
        "/api/ssl",
        "POST",
        { mode: "check" },
      );
      const okc = r.results.filter((x) => x.ok).length;
      setMsg(`巡检完成：成功 ${okc}/${r.results.length}`);
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpsShell
      title="SSL 证书巡检"
      description="到期倒计时、健康度评分与 90 天历史趋势"
      actions={
        <>
          <button className="btn" disabled={busy} onClick={() => void runCheck()}>
            立即巡检
          </button>
          <button className="btn" onClick={() => void load()}>
            刷新
          </button>
        </>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}
      {msg ? <div className="card mb-4 p-4 text-sm text-muted">{msg}</div> : null}

      <div className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold">巡检域名</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addDomain();
            }}
          />
          <button className="btn btn-primary" disabled={busy} onClick={() => void addDomain()}>
            添加
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.watchlist ?? []).map((w) => (
            <span key={w.domain} className="chip gap-2">
              {w.domain}
              <button
                className="text-muted hover:text-err"
                onClick={() => void removeDomain(w.domain)}
                aria-label={`移除 ${w.domain}`}
              >
                ×
              </button>
            </span>
          ))}
          {(data?.watchlist ?? []).length === 0 ? (
            <span className="text-xs text-muted">尚未配置巡检域名</span>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted">
          后台按 {Math.round((data?.intervalSec ?? 21600) / 60)} 分钟间隔自动批量巡检（进程内单例定时器）。
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">域名</th>
              <th className="px-3 py-2">颁发者</th>
              <th className="px-3 py-2">到期</th>
              <th className="px-3 py-2">剩余天数</th>
              <th className="px-3 py-2">健康度</th>
              <th className="px-3 py-2">90 天趋势</th>
            </tr>
          </thead>
          <tbody>
            {(data?.certs ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  暂无证书记录
                </td>
              </tr>
            ) : (
              (data?.certs ?? []).map((c) => {
                let hist: { ts: string; days_left: number }[] = [];
                try {
                  hist = JSON.parse(c.history || "[]");
                } catch {
                  hist = [];
                }
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{c.domain}</td>
                    <td className="px-3 py-2 text-xs text-muted">{c.issuer || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{fmtDate(c.not_after)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      <span
                        className={
                          (c.days_left ?? 9999) < 0
                            ? "text-err"
                            : (c.days_left ?? 9999) < 30
                              ? "text-warn"
                              : "text-ok"
                        }
                      >
                        {c.days_left ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-bg">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${c.health ?? 0}%`, background: healthColor(c.health) }}
                          />
                        </div>
                        <span className="tabular-nums text-xs">{c.health ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Sparkline
                        points={hist.map((h) => ({ t: new Date(h.ts).getTime(), v: h.days_left }))}
                        width={140}
                        height={34}
                        color={healthColor(c.health)}
                        label={`${c.domain} 剩余天数`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
