/**
 * Multi-channel notification senders.
 * Every sender returns a result object instead of throwing, so a failing
 * channel never breaks the caller.
 */
import { now, one, rows, run, uid } from "./db";

export type ChannelKind =
  | "wecom"
  | "dingtalk"
  | "feishu"
  | "telegram"
  | "bark"
  | "gotify"
  | "ntfy"
  | "webhook";

export const CHANNEL_KINDS: ChannelKind[] = [
  "wecom",
  "dingtalk",
  "feishu",
  "telegram",
  "bark",
  "gotify",
  "ntfy",
  "webhook",
];

export type NotifyConfig = {
  webhook?: string;
  secret?: string;
  token?: string;
  chatId?: string;
  botToken?: string;
  deviceKey?: string;
  topic?: string;
  priority?: number;
  title?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
};

export type NotifyResult = {
  ok: boolean;
  channel: ChannelKind;
  status?: number;
  error?: string;
  detail?: string;
};

export type NotificationRow = {
  id: string;
  channel: string;
  config: string;
  enabled: number;
  created_at: string;
};

const SECRET_KEYS = ["secret", "token", "botToken", "deviceKey", "webhook"];

export function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 3)}••••${v.slice(-2)}`;
}

/** Returns a config copy where sensitive fields are masked. */
export function maskConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (SECRET_KEYS.includes(k) && typeof v === "string") {
      out[k] = maskValue(v);
    } else if (k === "headers" && v && typeof v === "object") {
      const h: Record<string, string> = {};
      for (const [hk, hv] of Object.entries(v as Record<string, string>)) {
        h[hk] = /token|secret|key|auth/i.test(hk) ? maskValue(hv) : hv;
      }
      out[k] = h;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ------------------------------ channel CRUD ------------------------------ */

export function listNotifications(): NotificationRow[] {
  return rows<NotificationRow>("SELECT * FROM notifications ORDER BY created_at ASC");
}

export function getNotification(id: string): NotificationRow | undefined {
  return one<NotificationRow>("SELECT * FROM notifications WHERE id = ?", id);
}

export function createNotification(channel: ChannelKind, config: NotifyConfig): NotificationRow {
  const id = uid("nt_");
  run(
    "INSERT INTO notifications(id, channel, config, enabled, created_at) VALUES(?,?,?,?,?)",
    id,
    channel,
    JSON.stringify(config ?? {}),
    1,
    now(),
  );
  return getNotification(id)!;
}

export function updateNotification(id: string, patch: { channel?: ChannelKind; config?: NotifyConfig; enabled?: boolean }): NotificationRow | undefined {
  const cur = getNotification(id);
  if (!cur) return undefined;
  const channel = patch.channel ?? cur.channel;
  let config = cur.config;
  if (patch.config) {
    // merge, keeping existing secret values when the client sends a masked value
    const existing = safeParse(cur.config);
    const incoming = patch.config as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v === "string" && SECRET_KEYS.includes(k) && v.includes("••")) continue;
      merged[k] = v;
    }
    config = JSON.stringify(merged);
  }
  const enabled = patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0;
  run(
    "UPDATE notifications SET channel=?, config=?, enabled=? WHERE id=?",
    channel,
    config,
    enabled,
    id,
  );
  return getNotification(id);
}

export function deleteNotification(id: string): boolean {
  const cur = getNotification(id);
  if (!cur) return false;
  run("DELETE FROM notifications WHERE id = ?", id);
  return true;
}

export function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* -------------------------------- senders -------------------------------- */

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 8000,
): Promise<{ status: number; text: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendToChannel(channel: ChannelKind, cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  try {
    switch (channel) {
      case "wecom":
        return await sendWecom(cfg, title, body);
      case "dingtalk":
        return await sendDingtalk(cfg, title, body);
      case "feishu":
        return await sendFeishu(cfg, title, body);
      case "telegram":
        return await sendTelegram(cfg, title, body);
      case "bark":
        return await sendBark(cfg, title, body);
      case "gotify":
        return await sendGotify(cfg, title, body);
      case "ntfy":
        return await sendNtfy(cfg, title, body);
      case "webhook":
        return await sendWebhook(cfg, title, body);
      default:
        return { ok: false, channel, error: `不支持的通知通道：${channel}` };
    }
  } catch (err) {
    return { ok: false, channel, error: String((err as Error)?.message ?? err) };
  }
}

async function sendWecom(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  if (!cfg.webhook) return { ok: false, channel: "wecom", error: "缺少 webhook 地址" };
  const url = cfg.secret ? `${cfg.webhook}?key=${encodeURIComponent(cfg.secret)}` : cfg.webhook;
  const { status, text } = await postJson(url, { msgtype: "text", text: { content: `${title}\n${body}` } });
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-json */
  }
  const ok = status >= 200 && status < 300 && (parsed?.errcode === 0 || parsed?.errcode === undefined);
  return { ok, channel: "wecom", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendDingtalk(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  if (!cfg.webhook) return { ok: false, channel: "dingtalk", error: "缺少 webhook 地址" };
  let url = cfg.webhook;
  if (cfg.secret) {
    const ts = Date.now();
    const sign = await signDingtalk(cfg.secret, ts);
    url += `?timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
  }
  const { status, text } = await postJson(url, {
    msgtype: "text",
    text: { content: `${title}\n${body}` },
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-json */
  }
  const ok = status >= 200 && status < 300 && (parsed?.errcode === 0 || parsed?.errcode === undefined);
  return { ok, channel: "dingtalk", status, error: ok ? undefined : text.slice(0, 200) };
}

async function signDingtalk(secret: string, timestamp: number): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

async function sendFeishu(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  if (!cfg.webhook) return { ok: false, channel: "feishu", error: "缺少 webhook 地址" };
  const payload: Record<string, unknown> = {
    msg_type: "text",
    content: { text: `${title}\n${body}` },
  };
  if (cfg.secret) {
    const { createHmac } = await import("node:crypto");
    const ts = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${ts}\n${cfg.secret}`;
    const sign = createHmac("sha256", stringToSign).update("").digest("base64");
    payload.timestamp = ts;
    payload.sign = sign;
  }
  const { status, text } = await postJson(cfg.webhook, payload);
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-json */
  }
  const ok = status >= 200 && status < 300 && (parsed?.code === 0 || parsed?.code === undefined);
  return { ok, channel: "feishu", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendTelegram(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  if (!cfg.botToken || !cfg.chatId) {
    return { ok: false, channel: "telegram", error: "缺少 botToken 或 chatId" };
  }
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const { status, text } = await postJson(url, {
    chat_id: cfg.chatId,
    text: `${title}\n${body}`,
    disable_web_page_preview: true,
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-json */
  }
  const ok = status >= 200 && status < 300 && parsed?.ok !== false;
  return { ok, channel: "telegram", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendBark(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  const base = cfg.webhook?.replace(/\/$/, "") ?? "";
  if (!cfg.deviceKey) return { ok: false, channel: "bark", error: "缺少 deviceKey" };
  const url = base ? `${base}/${cfg.deviceKey}` : `https://api.day.app/${cfg.deviceKey}`;
  const { status, text } = await postJson(url, {
    title,
    body,
    group: "bestnav",
    isArchive: 1,
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-json */
  }
  const ok = status >= 200 && status < 300 && (parsed?.code === 200 || parsed?.code === undefined);
  return { ok, channel: "bark", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendGotify(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  const base = cfg.webhook?.replace(/\/$/, "");
  if (!base || !cfg.token) return { ok: false, channel: "gotify", error: "缺少服务器地址或 token" };
  const url = base.startsWith("http") ? `${base}/message?token=${cfg.token}` : `https://${base}/message?token=${cfg.token}`;
  const { status, text } = await postJson(url, { title, message: body, priority: cfg.priority ?? 5 });
  const ok = status >= 200 && status < 300;
  return { ok, channel: "gotify", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendNtfy(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  const topic = cfg.topic ?? "bestnav";
  const base = cfg.webhook?.replace(/\/$/, "") ?? "https://ntfy.sh";
  const url = `${base.startsWith("http") ? base : `https://${base}`}/${topic}`;
  const { status, text } = await postJson(url, { title, message: body, priority: cfg.priority ?? 3 });
  const ok = status >= 200 && status < 300;
  return { ok, channel: "ntfy", status, error: ok ? undefined : text.slice(0, 200) };
}

async function sendWebhook(cfg: NotifyConfig, title: string, body: string): Promise<NotifyResult> {
  if (!cfg.webhook) return { ok: false, channel: "webhook", error: "缺少 webhook 地址" };
  const method = (cfg.method ?? "POST").toUpperCase();
  const template = cfg.bodyTemplate;
  const payload = template
    ? interpolate(template, { title, body, ts: now() })
    : { title, body, ts: now() };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(cfg.webhook, {
      method,
      headers: { "content-type": "application/json", ...(cfg.headers ?? {}) },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(payload),
      signal: ac.signal,
    });
    const text = await res.text().catch(() => "");
    const ok = res.status >= 200 && res.status < 300;
    return { ok, channel: "webhook", status: res.status, error: ok ? undefined : text.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

/** Broadcast to every enabled channel; returns per-channel results. */
export async function broadcast(
  title: string,
  body: string,
  only?: ChannelKind[],
): Promise<{ channel: ChannelKind; name: string; result: NotifyResult }[]> {
  const list = listNotifications().filter((n) => n.enabled);
  const out: { channel: ChannelKind; name: string; result: NotifyResult }[] = [];
  for (const n of list) {
    const ch = n.channel as ChannelKind;
    if (only && !only.includes(ch)) continue;
    const cfg = safeParse(n.config) as NotifyConfig;
    const result = await sendToChannel(ch, cfg, title, body);
    out.push({ channel: ch, name: n.id, result });
  }
  return out;
}

/**
 * Send a test message through every enabled channel.
 * Returns the count of successful and failed deliveries.
 */
export async function sendTestNotification(): Promise<{ ok: number; fail: number }> {
  const results = await broadcast("BestNav 测试", "这是一条来自控制室的测试通知。");
  const ok = results.filter((r) => r.result.ok).length;
  return { ok, fail: results.length - ok };
}
