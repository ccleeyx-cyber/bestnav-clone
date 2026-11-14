/**
 * Docker 容器 → 导航书签 自动发现与同步。
 *
 * 规则：
 *  - 只有带 Web 端口映射的容器才视为可访问的 Web 服务
 *  - 已存在的同 URL 书签不重复添加
 *  - 黑名单（settings['docker.blacklist']）中的容器名跳过
 *  - 发现结果记录在 settings['docker-discovered']
 */
import { now, one, run, setSetting, setting, uid } from "./db";
import {
  composeProject,
  containerName,
  dockerConfigured,
  listContainers,
  type DockerContainer,
} from "./docker";

export type SyncResult = {
  added: number;
  skipped: number;
};

export type DiscoveredEntry = {
  containerId: string;
  name: string;
  url: string;
  port: number;
  project: string | null;
  at: string;
};

const DISCOVERY_KEY = "docker-discovered";
const BLACKLIST_KEY = "docker.blacklist";
export const DOCKER_TAG = "docker";

/** Web 服务常用私有端口 */
const WEB_PORTS = new Set([80, 443, 3000, 5000, 8000, 8080, 8888, 9000]);

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(setting(key, ""));
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function getDiscovered(): DiscoveredEntry[] {
  return readJSON<DiscoveredEntry[]>(DISCOVERY_KEY, []);
}

export function setDiscovered(list: DiscoveredEntry[]): void {
  setSetting(DISCOVERY_KEY, JSON.stringify(list));
}

export function getBlacklist(): string[] {
  return readJSON<string[]>(BLACKLIST_KEY, []);
}

export function setBlacklist(list: string[]): void {
  setSetting(BLACKLIST_KEY, JSON.stringify(list));
}

/** 从端口映射里挑出可访问的 Web 地址 */
export function webUrlOf(c: DockerContainer): { url: string; port: number } | null {
  const ports = c.Ports ?? [];
  const hit = ports.find((p) => p.PublicPort && p.Type === "tcp" && WEB_PORTS.has(p.PrivatePort));
  if (!hit?.PublicPort) return null;
  const host = hit.IP && hit.IP !== "0.0.0.0" && hit.IP !== "::" ? hit.IP : "localhost";
  const scheme = hit.PrivatePort === 443 ? "https" : "http";
  return { url: `${scheme}://${host}:${hit.PublicPort}`, port: hit.PublicPort };
}

/**
 * 拉取容器列表并把带端口映射的 Web 服务容器加入 bookmarks。
 */
export async function syncDockerBookmarks(): Promise<SyncResult> {
  if (!dockerConfigured()) return { added: 0, skipped: 0 };

  const containers = await listContainers();
  const blacklist = new Set(getBlacklist().map((x) => x.trim().toLowerCase()));
  const discovered = getDiscovered();
  const known = new Set(discovered.map((d) => d.containerId));
  let added = 0;
  let skipped = 0;

  for (const c of containers) {
    const name = containerName(c);
    if (blacklist.has(name.toLowerCase())) {
      skipped++;
      continue;
    }
    const mapping = webUrlOf(c);
    if (!mapping) continue;
    if (known.has(c.Id)) continue;

    const exists = one<{ id: string }>("SELECT id FROM bookmarks WHERE url = ? LIMIT 1", mapping.url);
    if (!exists) {
      const id = uid("b_");
      const ts = now();
      const project = composeProject(c);
      const tags = JSON.stringify([DOCKER_TAG, project ?? "container", name]);
      run(
        `INSERT INTO bookmarks(id, group_id, title, url, internal_url, description, icon, icon_color, tags, visibility, owner_id, sort_order, enabled, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        null,
        name,
        mapping.url,
        mapping.url,
        `由 Docker 自动发现（${project ?? "独立容器"}）`,
        "🧩",
        "",
        tags,
        "public",
        null,
        0,
        1,
        ts,
        ts,
      );
    }
    known.add(c.Id);
    added++;
    discovered.push({
      containerId: c.Id,
      name,
      url: mapping.url,
      port: mapping.port,
      project: composeProject(c),
      at: now(),
    });
  }

  setDiscovered(discovered);
  return { added, skipped };
}
