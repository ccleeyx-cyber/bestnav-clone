"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { apiGet, apiSend } from "@/components/ops/usePolling";

type ChannelKind =
  | "wecom"
  | "dingtalk"
  | "feishu"
  | "telegram"
  | "bark"
  | "gotify"
  | "ntfy"
  | "webhook";

type Channel = {
  id: string;
  channel: ChannelKind;
  enabled: boolean;
  created_at: string;
  config: Record<string, unknown>;
};

const KIND_LABEL: Record<ChannelKind, string> = {
  wecom: "企业微信机器人",
  dingtalk: "钉钉",
  feishu: "飞书",
  telegram: "Telegram",
  bark: "Bark",
  gotify: "Gotify",
  ntfy: "ntfy",
  webhook: "通用 Webhook",
};

const FIELDS: Record<ChannelKind, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  wecom: [
    { key: "webhook", label: "Webhook 地址", placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." },
  ],
  dingtalk: [
    { key: "webhook", label: "Webhook 地址", placeholder: "https://oapi.dingtalk.com/robot/send?access_token=..." },
    { key: "secret", label: "加签密钥", placeholder: "SEC...", secret: true },
  ],
  feishu: [
    { key: "webhook", label: "Webhook 地址", placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/..." },
    { key: "secret", label: "签名校验密钥", placeholder: "...", secret: true },
  ],
  telegram: [
    { key: "botToken", label: "Bot Token", placeholder: "123456:ABC...", secret: true },
    { key: "chatId", label: "Chat ID", placeholder: "-1001234567890" },
  ],
  bark: [
    { key: "webhook", label: "服务器地址", placeholder: "https://api.day.app" },
    { key: "deviceKey", label: "Device Key", placeholder: "xxxxxxxx", secret: true },
  ],
  gotify: [
    { key: "webhook", label: "服务器地址", placeholder: "https://gotify.example.com" },
    { key: "token", label: "应用 Token", placeholder: "Axxxxxxx", secret: true },
  ],
  ntfy: [
    { key: "webhook", label: "服务器地址", placeholder: "https://ntfy.sh" },
    { key: "topic", label: "Topic", placeholder: "bestnav" },
    { key: "priority", label: "优先级 (0-10)", placeholder: "3" },
  ],
  webhook: [
    { key: "webhook", label: "目标地址", placeholder: "https://example.com/hook" },
    { key: "method", label: "方法", placeholder: "POST" },
    { key: "bodyTemplate", label: "Body 模板", placeholder: '{"title":"{{title}}","body":"{{body}}"}' },
  ],
};

export default function SettingsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [kinds, setKinds] = useState<ChannelKind[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ChannelKind>("wecom");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ channels: Channel[]; kinds: ChannelKind[] }>("/api/notify");
      setChannels(d.channels);
      setKinds(d.kinds);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const config: Record<string, unknown> = {};
      for (const f of FIELDS[kind]) {
        const v = values[f.key];
        if (v === undefined || v === "") continue;
        config[f.key] = f.key === "priority" ? Number(v) : v;
      }
      await apiSend("/api/notify", "POST", { channel: kind, config });
      setValues({});
      setMsg(`已新增 ${KIND_LABEL[kind]} 通道`);
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Channel) => {
    try {
      await apiSend("/api/notify", "PATCH", { id: c.id, enabled: !c.enabled });
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    }
  };

  const remove = async (c: Channel) => {
    try {
      await apiSend(`/api/notify?id=${encodeURIComponent(c.id)}`, "DELETE");
      setMsg("通道已删除");
      await load();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    }
  };

  return (
    <OpsShell
      title="通知通道配置"
      description="企业微信 / 钉钉 / 飞书 / Telegram / Bark / Gotify / ntfy / 通用 Webhook"
      actions={
        <button className="btn" onClick={() => void load()}>
          刷新
        </button>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}
      {msg ? <div className="card mb-4 p-4 text-sm text-muted">{msg}</div> : null}

      <div className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">新增通道</h2>
        <div className="mb-3 flex flex-wrap gap-1">
          {kinds.map((k) => (
            <button
              key={k}
              className={`btn px-2 py-1 text-xs ${kind === k ? "btn-primary" : ""}`}
              onClick={() => {
                setKind(k);
                setValues({});
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS[kind].map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs text-muted">{f.label}</label>
              <input
                className="input"
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button className="btn btn-primary mt-3" disabled={busy} onClick={() => void create()}>
          保存通道
        </button>
        <p className="mt-2 text-xs text-muted">
          敏感字段保存后仅以掩码返回，读取接口不会返回明文。
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">通道</th>
              <th className="px-3 py-2">配置</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  尚未配置通知通道
                </td>
              </tr>
            ) : (
              channels.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{KIND_LABEL[c.channel] ?? c.channel}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {Object.entries(c.config)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join("  ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`chip ${c.enabled ? "text-ok" : "text-muted"}`}>
                      {c.enabled ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(c.created_at).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button className="btn px-2 py-1 text-xs" onClick={() => void toggle(c)}>
                        {c.enabled ? "停用" : "启用"}
                      </button>
                      <button
                        className="btn px-2 py-1 text-xs text-err"
                        onClick={() => void remove(c)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </OpsShell>
  );
}
