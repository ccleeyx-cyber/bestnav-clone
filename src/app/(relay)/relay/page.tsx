"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RelayPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "providers" | "tokens" | "usage" | "keys" | "mcp">("overview");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/relay/stats?days=30");
      const j = await r.json();
      if (!j.ok) { setErr(j.error ?? "加载失败"); return; }
      setData(j.data);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const tabs = [
    ["overview", "数据看板"],
    ["providers", "供应商"],
    ["tokens", "令牌"],
    ["usage", "用量明细"],
    ["keys", "开放 API"],
    ["mcp", "MCP 接入"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">API 中转站</h1>
        <button className="btn" onClick={() => router.back()}>返回</button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={`btn ${tab === k ? "btn-primary" : ""}`}
            onClick={() => setTab(k as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {err && <div className="card p-4 text-sm text-err">{err}</div>}
      {!data && !err && <div className="text-muted text-sm">加载中…</div>}

      {data && tab === "overview" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="容器运行中" value={`${data.summary.containers.running}/${data.summary.containers.total}`} />
          <Stat label="证书总数" value={String(data.summary.certificates.total)} hint={`${data.summary.certificates.expiringSoon} 个 30 天内到期`} />
          <Stat label="书签条目" value={String(data.summary.bookmarks)} />
          <Stat label="运行时长" value={`${Math.floor(data.summary.uptimeSeconds / 3600)} 小时`} />
        </div>
      )}

      {data && tab === "providers" && (
        <ProvidersPanel />
      )}

      {data && tab === "tokens" && (
        <TokensPanel />
      )}

      {data && tab === "usage" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="p-3">模型</th>
                <th className="p-3">调用次数</th>
                <th className="p-3">输入 Token</th>
                <th className="p-3">输出 Token</th>
                <th className="p-3">费用 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {data.usage.map((u: any) => (
                <tr key={u.model} className="border-t border-border">
                  <td className="p-3">{u.model}</td>
                  <td className="p-3">{u.n}</td>
                  <td className="p-3">{u.prompt_tokens ?? 0}</td>
                  <td className="p-3">{u.completion_tokens ?? 0}</td>
                  <td className="p-3">${(u.cost_usd ?? 0).toFixed(4)}</td>
                </tr>
              ))}
              {!data.usage.length && (
                <tr><td colSpan={5} className="p-6 text-center text-muted">暂无用量记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "keys" && <ApiKeysPanel />}
      {tab === "mcp" && <McpPanel />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-muted text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

function ProvidersPanel() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", base_url: "", api_key: "", models: "", priority: 0 });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/relay");
    const j = await r.json();
    if (j.ok) setList(j.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setMsg("");
    const r = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        models: form.models.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    const j = await r.json();
    if (!j.ok) { setMsg(j.error); return; }
    setForm({ name: "", base_url: "", api_key: "", models: "", priority: 0 });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="mb-3 font-medium">新增供应商</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Base URL（不含 /chat/completions）" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          <input className="input" placeholder="API Key" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          <input className="input" placeholder="模型列表（逗号分隔，留空=全部）" value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn btn-primary" onClick={submit}>添加</button>
          {msg && <span className="text-err text-sm">{msg}</span>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-left">
            <tr>
              <th className="p-3">名称</th>
              <th className="p-3">Base URL</th>
              <th className="p-3">Key</th>
              <th className="p-3">状态</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{r.name}</td>
                <td className="p-3 text-muted">{r.base_url}</td>
                <td className="p-3 font-mono text-xs">{r.api_key_masked}</td>
                <td className="p-3">
                  <span className={`chip ${r.health_state === "healthy" ? "text-ok" : r.health_state === "cooldown" ? "text-warn" : ""}`}>
                    {r.health_state}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    className="btn"
                    onClick={async () => {
                      await fetch(`/api/relay?id=${r.id}`, { method: "DELETE" });
                      load();
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="p-6 text-center text-muted">暂无供应商</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokensPanel() {
  const [name, setName] = useState("");
  const [issued, setIssued] = useState("");
  const [err, setErr] = useState("");

  const create = async () => {
    setErr("");
    const r = await fetch("/api/relay/token", {      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!j.ok) { setErr(j.error); return; }
    setIssued(j.data.token);
    setName("");
  };

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-medium">签发中转站令牌</h2>
      <div className="flex gap-2">
        <input className="input" placeholder="令牌名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" onClick={create}>签发</button>
      </div>
      {err && <div className="text-err text-sm">{err}</div>}
      {issued && (
        <div className="rounded-lg bg-bg border border-border p-3">
          <div className="text-muted mb-1 text-xs">令牌只显示一次，请立即保存</div>
          <code className="break-all font-mono text-sm">{issued}</code>
        </div>
      )}
      <div className="text-muted text-xs">
        用法：把令牌填入任何 OpenAI 兼容客户端的 Base URL：<code>/api/v1</code>（路径 <code>/api/v1/chat/completions</code>）
      </div>
    </div>
  );
}

function ApiKeysPanel() {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState("");
  const [tools, setTools] = useState("");
  const [ips, setIps] = useState("");
  const [rate, setRate] = useState(0);

  const load = async () => {
    const r = await fetch("/api/apikeys");
    const j = await r.json();
    if (j.ok) setList(j.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setIssued("");
    const r = await fetch("/api/apikeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        allowed_tools: tools.split(",").map((s) => s.trim()).filter(Boolean),
        allowed_ips: ips.split(",").map((s) => s.trim()).filter(Boolean),
        rate_limit: rate,
      }),
    });
    const j = await r.json();
    if (!j.ok) return;
    setIssued(j.data.key);
    setName("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h2 className="font-medium">创建开放 API Key</h2>
        <input className="input" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="允许的工具（逗号分隔，留空=全部）" value={tools} onChange={(e) => setTools(e.target.value)} />
        <input className="input" placeholder="允许的来源 IP（逗号分隔，留空=不限）" value={ips} onChange={(e) => setIps(e.target.value)} />
        <input className="input" type="number" placeholder="频次配额（次/分钟，0=不限）" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={create}>创建</button>
          {issued && <code className="font-mono text-xs">{issued}</code>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-left">
            <tr><th className="p-3">名称</th><th className="p-3">Key</th><th className="p-3">工具</th><th className="p-3">配额</th><th className="p-3">操作</th></tr>
          </thead>
          <tbody>
            {list.map((k) => (
              <tr key={k.id} className="border-t border-border">
                <td className="p-3">{k.name}</td>
                <td className="p-3 font-mono text-xs">{k.key_masked}</td>
                <td className="p-3 text-muted">{k.allowed_tools.join(", ") || "全部"}</td>
                <td className="p-3 text-muted">{k.rate_limit || "不限"}</td>
                <td className="p-3">
                  <button className="btn" onClick={async () => { await fetch(`/api/apikeys?id=${k.id}`, { method: "DELETE" }); load(); }}>删除</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="p-6 text-center text-muted">暂无 Key</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function McpPanel() {
  const [token, setToken] = useState("");
  const [usage, setUsage] = useState("");
  const [err, setErr] = useState("");

  const gen = async () => {
    setErr("");
    const r = await fetch("/api/mcp/token", { method: "POST" });
    const j = await r.json();
    if (!j.ok) { setErr(j.error); return; }
    setToken(j.data.token);
    setUsage(j.data.usage);
  };

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-medium">MCP 接入</h2>
      <p className="text-muted text-sm">
        生成端点与令牌后，Claude、Cursor 等支持 MCP 的 AI 客户端即可直连面板的开关层，用自然语言查状态、启停容器、触发备份。
      </p>
      <button className="btn btn-primary" onClick={gen}>生成令牌</button>
      {err && <div className="text-err text-sm">{err}</div>}
      {token && (
        <div className="rounded-lg border border-border bg-bg p-3">
          <div className="text-muted mb-1 text-xs">令牌只显示一次，请立即保存</div>
          <code className="break-all font-mono text-sm">{token}</code>
        </div>
      )}
      {usage && <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">{usage}</pre>}
    </div>
  );
}
