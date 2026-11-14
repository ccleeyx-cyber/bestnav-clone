"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { apiGet, apiSend } from "@/components/ops/usePolling";

type PortMap = { IP?: string; PrivatePort: number; PublicPort?: number; Type: string };
type Container = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: PortMap[];
  project: string | null;
  attachUrl: string | null;
};
type Stats = {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
};
type DockerPayload = {
  configured: boolean;
  hint?: string;
  containers: Container[];
  stats: Record<string, Stats | null>;
};

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

function portText(p: PortMap): string {
  if (!p.PublicPort) return `${p.PrivatePort}/${p.Type}`;
  return `${p.PublicPort}→${p.PrivatePort}/${p.Type}`;
}

export default function DockerPage() {
  const [data, setData] = useState<DockerPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [termFor, setTermFor] = useState<Container | null>(null);
  const logTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<DockerPayload>("/api/monitor/docker");
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

  // rolling logs: poll tail=200 every 5s
  useEffect(() => {
    if (logTimer.current) clearInterval(logTimer.current);
    if (!logFor) {
      setLogs([]);
      return;
    }
    const pull = async () => {
      try {
        const d = await apiGet<{ logs: string }>(
          `/api/monitor/docker/logs?id=${encodeURIComponent(logFor)}&tail=200`,
        );
        setLogs(d.logs.split(/\r?\n/).filter(Boolean).slice(-200));
      } catch (e) {
        setErr((e as Error).message);
      }
    };
    void pull();
    logTimer.current = setInterval(() => void pull(), 5000);
    return () => {
      if (logTimer.current) clearInterval(logTimer.current);
    };
  }, [logFor]);

  const containers = data?.containers ?? [];
  const allSelected = containers.length > 0 && selected.length === containers.length;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = async (action: "start" | "stop" | "restart") => {
    if (!selected.length) {
      setMsg("请先勾选容器");
      return;
    }
    setBusy(true);
    try {
      const r = await apiSend<{ okCount: number; total: number }>("/api/monitor/docker", "POST", {
        action,
        ids: selected,
      });
      setMsg(`${action} 完成：${r.okCount}/${r.total} 成功`);
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(
    () =>
      containers.map((c) => ({
        c,
        s: data?.stats?.[c.id] ?? null,
      })),
    [containers, data],
  );

  return (
    <OpsShell
      title="容器监控"
      description="通过远程 Docker Engine 只读接入，容器操作受应用侧 ACL 限制"
      actions={
        <>
          <button className="btn" onClick={() => void load()}>
            刷新
          </button>
          <button className="btn" disabled={busy || !selected.length} onClick={() => void run("start")}>
            批量启动
          </button>
          <button className="btn" disabled={busy || !selected.length} onClick={() => void run("stop")}>
            批量停止
          </button>
          <button className="btn" disabled={busy || !selected.length} onClick={() => void run("restart")}>
            批量重启
          </button>
        </>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}
      {msg ? <div className="card mb-4 p-4 text-sm text-muted">{msg}</div> : null}

      {data && !data.configured ? (
        <div className="card p-6">
          <h2 className="text-base font-semibold">Docker 未接入</h2>
          <p className="mt-1 text-sm text-muted">
            本模块不挂载 docker.sock，需要通过远程 Docker Engine 接入。
          </p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-bg p-4 text-xs text-muted">
            {data.hint}
          </pre>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : containers.map((c) => c.id))}
                  />
                </th>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">镜像</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">CPU%</th>
                <th className="px-3 py-2">内存</th>
                <th className="px-3 py-2">端口映射</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    暂无容器
                  </td>
                </tr>
              ) : (
                rows.map(({ c, s }) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      {c.project ? <div className="text-xs text-muted">{c.project}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-muted">{c.image}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`chip ${c.state === "running" ? "text-ok" : c.state === "paused" ? "text-warn" : "text-muted"}`}
                      >
                        {c.state}
                      </span>
                      <div className="mt-0.5 text-xs text-muted">{c.status}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s ? `${s.cpuPercent}` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {s ? (
                        <>
                          {fmtBytes(s.memUsage)}
                          <div className="text-xs text-muted">/ {fmtBytes(s.memLimit)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {c.ports.length ? c.ports.map(portText).join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button className="btn px-2 py-1 text-xs" onClick={() => setLogFor(c.id)}>
                          日志
                        </button>
                        <button
                          className="btn px-2 py-1 text-xs"
                          disabled={!c.attachUrl}
                          onClick={() => setTermFor(c)}
                          title={c.attachUrl ? "打开 Web 终端" : "当前环境无法直连 Docker Engine 的 WebSocket"}
                        >
                          终端
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {logFor ? (
        <section className="mt-4">
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">容器日志（每 5 秒拉取 tail=200）</h2>
              <button className="btn px-2 py-1 text-xs" onClick={() => setLogFor(null)}>
                关闭
              </button>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs leading-5 text-muted">
              {logs.length ? logs.join("\n") : "暂无日志输出"}
            </pre>
          </div>
        </section>
      ) : null}

      {termFor ? <WebTerminal container={termFor} onClose={() => setTermFor(null)} /> : null}
    </OpsShell>
  );
}

/**
 * Raw WebSocket terminal against the Docker Engine attach endpoint.
 * Uses the platform WebSocket implementation (no extra dependency).
 * Fails gracefully when the browser cannot reach the Engine.
 */
function WebTerminal({ container, onClose }: { container: Container; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("连接中…");
  const [input, setInput] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = container.attachUrl;
    if (!url) {
      setStatus("未接入：无法生成 attach 地址");
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setStatus(`无法建立连接：${(e as Error).message}`);
      return;
    }
    socketRef.current = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => setStatus("已连接（输入内容并回车发送）");
    ws.onmessage = (ev) => {
      const text =
        typeof ev.data === "string"
          ? ev.data
          : new TextDecoder().decode(new Uint8Array(ev.data as ArrayBuffer));
      setLines((l) => [...l, ...text.split(/\r?\n/).filter(Boolean)].slice(-200));
    };
    ws.onerror = () => setStatus("连接错误：浏览器无法直连 Docker Engine（可能被跨域或防火墙阻断）");
    ws.onclose = () => setStatus("连接已关闭");
    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [container.attachUrl]);

  const send = () => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(input.endsWith("\n") ? input : `${input}\n`);
    setInput("");
  };

  return (
    <div className="mt-4 card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Web 终端 · {container.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{status}</span>
          <button className="btn px-2 py-1 text-xs" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs leading-5 text-muted">
        {lines.length ? lines.join("\n") : "（无输出）"}
      </pre>
      <div className="mt-2 flex gap-2">
        <input
          className="input"
          value={input}
          placeholder="输入命令后回车"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button className="btn" onClick={send}>
          发送
        </button>
      </div>
    </div>
  );
}
