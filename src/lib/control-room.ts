/**
 * Control room switch wall.
 *
 * Every switch has a dry-run preview and an execution path. Executions and
 * dry-runs are accounted separately in audit_logs
 * (`control.dryrun` vs `control.exec`).
 *
 * `src/lib/control.ts` is the public bridge (owned by the platform module)
 * and re-exports everything below.
 */
import { audit } from "./auth";
import { containerOp, dockerConfigured, listContainers, type DockerOp } from "./docker";
import {
  getBlacklist,
  getDiscovered,
  setBlacklist,
  setDiscovered,
  syncDockerBookmarks,
  type DiscoveredEntry,
} from "./docker-bookmarks";
import { listNotifications, safeParse, sendToChannel, type ChannelKind } from "./notify";

export type { DiscoveredEntry };
export { getBlacklist, getDiscovered, setBlacklist, setDiscovered };

export type SwitchId =
  | "container.start"
  | "container.stop"
  | "container.restart"
  | "docker.sync"
  | "backup.run"
  | "notify.test"
  | "net.wol"
  | "index.rebuild";

export type SwitchDef = {
  id: SwitchId;
  title: string;
  kind: "docker" | "system" | "notify" | "network" | "index";
  impact: "有感" | "无感";
  idempotent: boolean;
  params: {
    name: string;
    type: "string" | "string[]" | "number" | "boolean";
    required: boolean;
    desc: string;
  }[];
  description: string;
};

export const SWITCHES: SwitchDef[] = [
  {
    id: "container.start",
    title: "启动容器",
    kind: "docker",
    impact: "有感",
    idempotent: true,
    params: [{ name: "ids", type: "string[]", required: true, desc: "容器 ID 或名称列表" }],
    description: "对指定容器执行 start；已运行的容器不受影响。",
  },
  {
    id: "container.stop",
    title: "停止容器",
    kind: "docker",
    impact: "有感",
    idempotent: true,
    params: [{ name: "ids", type: "string[]", required: true, desc: "容器 ID 或名称列表" }],
    description: "对指定容器执行 stop；未运行的容器不受影响。",
  },
  {
    id: "container.restart",
    title: "重启容器",
    kind: "docker",
    impact: "有感",
    idempotent: false,
    params: [{ name: "ids", type: "string[]", required: true, desc: "容器 ID 或名称列表" }],
    description: "对指定容器执行 restart，会造成短暂服务中断。",
  },
  {
    id: "docker.sync",
    title: "立即同步 Docker",
    kind: "docker",
    impact: "无感",
    idempotent: true,
    params: [],
    description: "重新拉取容器列表并刷新自动发现的导航书签。",
  },
  {
    id: "backup.run",
    title: "立即备份",
    kind: "system",
    impact: "有感",
    idempotent: false,
    params: [{ name: "kind", type: "string", required: false, desc: "备份类型，默认 manual" }],
    description: "导出数据库与配置快照到数据目录。",
  },
  {
    id: "notify.test",
    title: "测试通知",
    kind: "notify",
    impact: "无感",
    idempotent: true,
    params: [
      { name: "channel", type: "string", required: false, desc: "指定通道 ID，留空则广播全部已启用通道" },
    ],
    description: "向通知通道发送一条测试消息，不改变任何业务数据。",
  },
  {
    id: "net.wol",
    title: "网络唤醒 (WOL)",
    kind: "network",
    impact: "有感",
    idempotent: false,
    params: [{ name: "mac", type: "string", required: true, desc: "目标 MAC 地址" }],
    description: "向局域网广播魔术包唤醒目标主机。",
  },
  {
    id: "index.rebuild",
    title: "重建索引",
    kind: "index",
    impact: "有感",
    idempotent: false,
    params: [],
    description: "依据当前书签与监控配置重建监控索引（重新同步 http 监控目标）。",
  },
];

/** 兼容别名：早期命名（backup.now / network.wol）等价于当前 id。 */
const ALIASES: Record<string, SwitchId> = {
  "backup.now": "backup.run",
  "network.wol": "net.wol",
};

export function getSwitch(id: string): SwitchDef | undefined {
  const canonical = ALIASES[id] ?? (id as SwitchId);
  return SWITCHES.find((s) => s.id === canonical);
}

export type SwitchOutcome = {
  ok: boolean;
  preview: Record<string, unknown>;
  message: string;
  details?: unknown;
};

/* ------------------------------- actions ------------------------------- */

async function resolveContainers(ids: string[]): Promise<{ id: string; name: string }[]> {
  const all = await listContainers();
  const byId = new Map(all.map((c) => [c.Id, c]));
  const byName = new Map(all.map((c) => [(c.Names?.[0] ?? "").replace(/^\//, ""), c]));
  const out: { id: string; name: string }[] = [];
  for (const raw of ids) {
    const key = String(raw).trim();
    if (!key) continue;
    const hit =
      byId.get(key) ??
      byName.get(key) ??
      (key.length === 12 ? byId.get(key.slice(0, 12)) : undefined);
    if (hit) out.push({ id: hit.Id, name: (hit.Names?.[0] ?? hit.Id.slice(0, 12)).replace(/^\//, "") });
  }
  return out;
}

export async function previewSwitch(
  def: SwitchDef,
  params: Record<string, unknown>,
): Promise<SwitchOutcome> {
  const preview: Record<string, unknown> = { switchId: def.id, title: def.title, impact: def.impact };
  switch (def.id) {
    case "container.start":
    case "container.stop":
    case "container.restart": {
      const ids = toStringArray(params.ids);
      preview.targets = ids;
      if (!dockerConfigured()) {
        return { ok: false, preview, message: "Docker 未接入，无法预览。" };
      }
      try {
        const targets = await resolveContainers(ids);
        preview.resolved = targets;
        return {
          ok: true,
          preview,
          message: `将对 ${targets.length} 个容器执行 ${def.id.split(".")[1]}（预演，未实际执行）。`,
        };
      } catch (e) {
        return { ok: false, preview, message: `解析容器失败：${(e as Error).message}` };
      }
    }
    case "docker.sync": {
      preview.discovered = getDiscovered().length;
      preview.blacklist = getBlacklist();
      return { ok: true, preview, message: "将重新拉取容器列表并刷新自动发现书签（预演）。" };
    }
    case "backup.run": {
      preview.kind = String(params.kind ?? "manual");
      preview.target = "数据目录快照";
      return { ok: true, preview, message: "将在数据目录生成一份备份文件（预演）。" };
    }
    case "notify.test": {
      const ch = params.channel ? String(params.channel) : "";
      preview.channel = ch || "全部已启用通道";
      return { ok: true, preview, message: `将向 ${ch || "全部已启用通道"} 发送一条测试消息（预演）。` };
    }
    case "net.wol": {
      const mac = String(params.mac ?? "").trim();
      preview.mac = mac;
      if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
        return { ok: false, preview, message: "MAC 地址格式不正确（需 AA:BB:CC:DD:EE:FF）。" };
      }
      return { ok: true, preview, message: `将向局域网广播唤醒包 ${mac}（预演）。` };
    }
    case "index.rebuild": {
      preview.scope = "monitors(kind=http)";
      return { ok: true, preview, message: "将重建 http 监控索引（预演）。" };
    }
    default:
      return { ok: false, preview, message: "未知开关。" };
  }
}

export async function execSwitch(
  def: SwitchDef,
  params: Record<string, unknown>,
): Promise<SwitchOutcome> {
  switch (def.id) {
    case "container.start":
    case "container.stop":
    case "container.restart": {
      if (!dockerConfigured()) return { ok: false, preview: {}, message: "Docker 未接入。" };
      const op = def.id.split(".")[1] as DockerOp;
      const targets = await resolveContainers(toStringArray(params.ids));
      const done: string[] = [];
      const failed: { name: string; error: string }[] = [];
      for (const t of targets) {
        try {
          await containerOp(t.id, op);
          done.push(t.name);
        } catch (e) {
          failed.push({ name: t.name, error: (e as Error).message });
        }
      }
      return {
        ok: failed.length === 0,
        preview: { targets: done, failed },
        message: failed.length
          ? `${done.length} 个容器已 ${op}，${failed.length} 个失败。`
          : `${done.length} 个容器已 ${op}。`,
        details: { done, failed },
      };
    }
    case "docker.sync": {
      const r = await syncDockerBookmarks();
      return {
        ok: true,
        preview: {},
        message: `已同步 Docker，新增 ${r.added} 个书签，跳过 ${r.skipped} 个。`,
        details: r,
      };
    }
    case "backup.run": {
      const kind = String(params.kind ?? "manual");
      const { createBackup } = await import("./backup");
      try {
        const path = await createBackup(kind);
        return { ok: true, preview: {}, message: `备份完成：${path}`, details: { path } };
      } catch (e) {
        return { ok: false, preview: {}, message: `备份失败：${(e as Error).message}` };
      }
    }
    case "notify.test": {
      const ch = params.channel ? String(params.channel) : "";
      const list = listNotifications().filter((n) => n.enabled);
      const targets = ch ? list.filter((n) => n.id === ch) : list;
      if (!targets.length) return { ok: false, preview: {}, message: "没有可用的通知通道。" };
      const results = [];
      for (const n of targets) {
        const cfg = safeParse(n.config);
        const res = await sendToChannel(
          n.channel as ChannelKind,
          cfg,
          "BestNav 测试",
          "这是一条来自控制室的测试通知。",
        );
        results.push({ channel: n.channel, ok: res.ok, error: res.error });
      }
      const okCount = results.filter((r) => r.ok).length;
      return {
        ok: okCount === results.length,
        preview: {},
        message: `测试通知已发送：成功 ${okCount}/${results.length}。`,
        details: results,
      };
    }
    case "net.wol": {
      const mac = String(params.mac ?? "").trim();
      const { sendWakeOnLan } = await import("./wol");
      const r = await sendWakeOnLan(mac);
      return {
        ok: r.ok,
        preview: { mac },
        message: r.ok ? `已向局域网广播唤醒包 ${mac}。` : `唤醒失败：${r.error ?? "未知错误"}`,
        details: r,
      };
    }
    case "index.rebuild": {
      const { rebuildMonitorIndex } = await import("./ops-runtime");
      const r = await rebuildMonitorIndex();
      return { ok: r.ok, preview: {}, message: r.message, details: r };
    }
    default:
      return { ok: false, preview: {}, message: "未知开关。" };
  }
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * Execute or preview a switch, writing an audit record.
 * Dry-run and execution are recorded separately:
 *   audit action = control.dryrun | control.exec
 */
export async function runSwitch(
  userId: string | null,
  switchId: string,
  dryRun: boolean,
  params: Record<string, unknown>,
  ip = "",
): Promise<SwitchOutcome> {
  const def = getSwitch(switchId);
  if (!def) return { ok: false, preview: {}, message: `未知开关：${switchId}` };
  try {
    const outcome = dryRun ? await previewSwitch(def, params) : await execSwitch(def, params);
    audit(
      userId,
      dryRun ? "control.dryrun" : "control.exec",
      def.id,
      { params, outcome: { ok: outcome.ok, message: outcome.message } },
      ip,
    );
    return outcome;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    audit(userId, dryRun ? "control.dryrun" : "control.exec", def.id, { params, error: msg }, ip);
    return { ok: false, preview: {}, message: `执行失败：${msg}` };
  }
}
