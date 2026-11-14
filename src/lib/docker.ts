/**
 * Minimal, allow-list based Docker Engine API client.
 *
 * Security model (two layers):
 *  1. Deployment: the app never mounts docker.sock. It talks to a remote
 *     Docker Engine over `DOCKER_HOST=tcp://host:2375` (ideally behind a
 *     read-only proxy on the host side).
 *  2. Application: every request passes `ALLOWED` below. Any path/method that
 *     is not explicitly listed is rejected before a socket is opened. This is
 *     the "read-only proxy" ACL semantics enforced again on the app side.
 */

export type DockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Status: string;
  Ports: { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
  Labels?: Record<string, string>;
  Created?: number;
};

export type DockerStats = {
  id: string;
  name: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  ts: number;
};

export type DockerOp = "start" | "stop" | "restart";

export class DockerNotConfiguredError extends Error {
  constructor() {
    super("Docker 未接入");
    this.name = "DockerNotConfiguredError";
  }
}

export class DockerAclError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DockerAclError";
  }
}

/** Resolve the configured Engine endpoint, or null when the module is off. */
export function dockerHost(): string | null {
  const raw = process.env.DOCKER_HOST?.trim();
  if (!raw) return null;
  if (raw.startsWith("tcp://")) return raw.replace(/^tcp:\/\//, "http://").replace(/\/$/, "");
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw.replace(/\/$/, "");
  // unix:// / npipe:// are not supported by this client.
  return null;
}

export function dockerConfigured(): boolean {
  return dockerHost() !== null;
}

/** Human readable hint shown on the UI when the module is not wired up. */
export const DOCKER_SETUP_HINT = [
  "本模块未挂载 docker.sock，需通过远程 Engine 接入：",
  "1) 在 Docker 主机上开放只读代理（tcp://127.0.0.1:2375，建议配合防火墙仅允许本应用主机访问）；",
  "2) 设置环境变量 DOCKER_HOST=tcp://<host>:2375 后重启应用；",
  "3) 生产环境请在代理层再限制为 /containers/json、/containers/*/stats、/containers/*/logs 只读。",
].join("\n");

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

type Rule = { method: "GET" | "POST"; re: RegExp; kind: string };

/** The complete ACL. Anything not matching is refused. */
const ALLOWED: Rule[] = [
  { method: "GET", re: /^\/containers\/json$/, kind: "list" },
  { method: "GET", re: /^\/containers\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\/stats$/, kind: "stats" },
  { method: "GET", re: /^\/containers\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\/logs$/, kind: "logs" },
  { method: "POST", re: /^\/containers\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\/(start|stop|restart)$/, kind: "op" },
];

export function checkAcl(method: string, path: string): Rule {
  const m = method.toUpperCase();
  const rule = ALLOWED.find((r) => r.method === m && r.re.test(path));
  if (!rule) {
    throw new DockerAclError(`拒绝访问：${m} ${path} 不在允许列表内`);
  }
  return rule;
}

async function engineFetch(
  method: "GET" | "POST",
  path: string,
  init?: { body?: unknown; timeoutMs?: number; raw?: boolean },
): Promise<Response> {
  const base = dockerHost();
  if (!base) throw new DockerNotConfiguredError();
  checkAcl(method, path);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), init?.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ac.signal,
      cache: "no-store",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function assertId(id: string): string {
  if (!ID.test(id)) throw new DockerAclError("非法容器 ID");
  return id;
}

export async function listContainers(): Promise<DockerContainer[]> {
  const res = await engineFetch("GET", "/containers/json");
  if (!res.ok) throw new Error(`Docker Engine 返回 ${res.status}`);
  const data = (await res.json()) as DockerContainer[];
  return Array.isArray(data) ? data : [];
}

/**
 * Docker multiplexes non-TTY streams with an 8-byte header per frame:
 * [streamType(1), 0,0,0, size(4, big endian)]
 */
export function demuxDockerStream(buf: Uint8Array): string {
  const out: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    const size =
      buf[off + 4] * 0x1000000 +
      (buf[off + 5] << 16) +
      (buf[off + 6] << 8) +
      buf[off + 7];
    const start = off + 8;
    const end = start + size;
    if (end > buf.length) break;
    out.push(Buffer.from(buf.subarray(start, end)).toString("utf8"));
    off = end;
  }
  if (out.length === 0 && buf.length > 0) {
    // TTY stream or raw payload
    out.push(Buffer.from(buf).toString("utf8"));
  }
  return out.join("");
}

export async function containerStats(id: string): Promise<DockerStats> {
  const cid = assertId(id);
  const res = await engineFetch("GET", `/containers/${cid}/stats?stream=false`);
  if (!res.ok) throw new Error(`Docker Engine 返回 ${res.status}`);
  const s = (await res.json()) as Record<string, any>;
  const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const sysDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
  const cores = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
  let cpuPercent = 0;
  if (cpuDelta > 0 && sysDelta > 0) cpuPercent = (cpuDelta / sysDelta) * cores * 100;
  const memUsage = s.memory_stats?.usage ?? 0;
  const memLimit = s.memory_stats?.limit ?? 0;
  let netRx = 0;
  let netTx = 0;
  for (const n of Object.values<any>(s.networks ?? {})) {
    netRx += n.rx_bytes ?? 0;
    netTx += n.tx_bytes ?? 0;
  }
  return {
    id: cid,
    name: (s.name ?? cid).replace(/^\//, ""),
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memUsage,
    memLimit,
    memPercent: memLimit ? Math.round((memUsage / memLimit) * 1000) / 10 : 0,
    netRx,
    netTx,
    ts: Date.now(),
  };
}

export async function containerLogs(id: string, tail = 200): Promise<string> {
  const cid = assertId(id);
  const t = Math.max(1, Math.min(2000, Math.floor(tail) || 200));
  const res = await engineFetch(
    "GET",
    `/containers/${cid}/logs?stdout=true&stderr=true&tail=${t}&timestamps=false`,
  );
  if (!res.ok) throw new Error(`Docker Engine 返回 ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return demuxDockerStream(buf);
}

export async function containerOp(id: string, op: DockerOp): Promise<void> {
  const cid = assertId(id);
  if (op !== "start" && op !== "stop" && op !== "restart") {
    throw new DockerAclError(`不支持的操作：${op}`);
  }
  const res = await engineFetch("POST", `/containers/${cid}/${op}`, { body: {} });
  if (!res.ok && res.status !== 304) {
    const text = await res.text().catch(() => "");
    throw new Error(`Docker ${op} 失败：${res.status} ${text.slice(0, 200)}`);
  }
}

/** WebSocket attach endpoint (browser talks to the Engine directly). */
export function attachWsUrl(id: string): string | null {
  const cid = assertId(id);
  const raw = process.env.DOCKER_HOST?.trim();
  if (!raw) return null;
  if (raw.startsWith("tcp://")) {
    return `ws://${raw.slice("tcp://".length).replace(/\/$/, "")}/containers/${cid}/attach?stream=1&stdout=1&stderr=1&stdin=1`;
  }
  const httpBase = raw.replace(/^tcp:\/\//, "http://").replace(/\/$/, "");
  if (httpBase.startsWith("https://")) {
    return `${httpBase.replace(/^https:\/\//, "wss://")}/containers/${cid}/attach?stream=1&stdout=1&stderr=1&stdin=1`;
  }
  if (httpBase.startsWith("http://")) {
    return `${httpBase.replace(/^http:\/\//, "ws://")}/containers/${cid}/attach?stream=1&stdout=1&stderr=1&stdin=1`;
  }
  return null;
}

export function containerName(c: DockerContainer): string {
  return (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, "");
}

export function composeProject(c: DockerContainer): string | null {
  const p = c.Labels?.["com.docker.compose.project"];
  return p && p.trim() ? p.trim() : null;
}
