"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "./client";

interface LogRow {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  target: string;
  detail: unknown;
  ip: string;
  created_at: string;
}

export default function AuditClient({ canPurge, scope }: { canPurge: boolean; scope: "all" | "own" }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (action) params.set("action", action);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    if (q) params.set("q", q);
    const res = await api<{ logs: LogRow[]; total: number }>(`/api/audit?${params}`);
    if (!res.ok) setError(res.error ?? "加载失败");
    else if (res.data) {
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setError("");
    }
    setLoading(false);
  }, [page, pageSize, action, from, to, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const purge = async () => {
    if (!confirm("确认清理 30 天前的审计日志？此操作不可撤销。")) return;
    const res = await api<{ removed: number }>("/api/audit", { method: "DELETE" });
    if (!res.ok) {
      setError(res.error ?? "清理失败");
      return;
    }
    setError("");
    void load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 md:grid-cols-5">
        <input
          className="input"
          placeholder="动作（如 user.create）"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="input"
          placeholder="搜索目标/详情"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="input"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="input"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex gap-2">
          <button className="btn" onClick={() => void load()}>
            刷新
          </button>
          {canPurge ? (
            <button className="btn text-err" onClick={purge}>
              清理 30 天前
            </button>
          ) : null}
        </div>
      </div>

      {scope === "own" ? (
        <p className="text-xs text-muted">你只能查看自己的审计记录。</p>
      ) : null}
      {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">动作</th>
              <th className="px-3 py-2 font-medium">目标</th>
              <th className="px-3 py-2 font-medium">详情</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={6}>
                  加载中…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={6}>
                  没有符合条件的审计记录
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <Fragment key={l.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {l.created_at.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">{l.username ?? l.user_id ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="chip">{l.action}</span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2">{l.target || "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="btn"
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                      >
                        {expanded === l.id ? "收起" : "展开"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted">{l.ip || "—"}</td>
                  </tr>
                  {expanded === l.id ? (
                    <tr className="border-b border-border last:border-0">
                      <td className="px-3 py-2" colSpan={6}>
                        <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs">
                          {JSON.stringify(l.detail, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <button
            className="btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
