/**
 * 书签 / 分组 / 卡片 种子数据（幂等）。
 *
 * 运行：pnpm exec tsx scripts/seed-bookmarks.ts
 *
 * 与 scripts/seed.ts（导航包 / 搜索源，由 searchtools 负责）分开，互不覆盖。
 * 重复运行不会重复插入：按 (name) / (title+url) / (kind+title) 判断是否已存在。
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.BESTNAV_DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "bestnav.db");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

const now = new Date().toISOString();

interface GroupSeed {
  key: string;
  name: string;
  icon: string;
}

const GROUPS: GroupSeed[] = [
  { key: "dev", name: "开发工具", icon: "💻" },
  { key: "docker", name: "Docker 与容器", icon: "🐳" },
  { key: "nas", name: "NAS 与存储", icon: "🗄️" },
  { key: "ops", name: "运维监控", icon: "📈" },
  { key: "ai", name: "AI 与模型", icon: "🤖" },
  { key: "life", name: "日常", icon: "🏠" },
];

interface BookmarkSeed {
  group: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
  internal_url?: string;
}

const BOOKMARKS: BookmarkSeed[] = [
  // 开发工具
  { group: "dev", title: "GitHub", url: "https://github.com", description: "代码托管与协作平台", tags: ["git", "代码"] },
  { group: "dev", title: "GitLab", url: "https://gitlab.com", description: "DevOps 平台", tags: ["git", "ci"] },
  { group: "dev", title: "Gitee", url: "https://gitee.com", description: "国内代码托管", tags: ["git", "国内"] },
  { group: "dev", title: "Stack Overflow", url: "https://stackoverflow.com", description: "程序员问答", tags: ["问答", "编程"] },
  { group: "dev", title: "MDN Web Docs", url: "https://developer.mozilla.org", description: "Web 文档", tags: ["文档", "前端"] },
  { group: "dev", title: "Regex101", url: "https://regex101.com", description: "正则表达式调试", tags: ["工具", "正则"] },
  { group: "dev", title: "JSON Formatter", url: "https://jsonformatter.org", description: "JSON 格式化", tags: ["工具", "json"] },
  { group: "dev", title: "Carbon", url: "https://carbon.now.sh", description: "代码截图", tags: ["工具", "截图"] },
  { group: "dev", title: "Can I use", url: "https://caniuse.com", description: "浏览器特性兼容性", tags: ["文档", "前端"] },
  { group: "dev", title: "TypeScript", url: "https://www.typescriptlang.org", description: "TypeScript 官网", tags: ["语言"] },

  // Docker
  { group: "docker", title: "Docker Hub", url: "https://hub.docker.com", description: "公共镜像仓库", tags: ["镜像", "容器"] },
  { group: "docker", title: "Docker 文档", url: "https://docs.docker.com", description: "Docker 官方文档", tags: ["文档", "容器"] },
  { group: "docker", title: "Docker Compose", url: "https://docs.docker.com/compose/", description: "多容器编排", tags: ["文档", "编排"] },
  { group: "docker", title: "Portainer CE", url: "https://www.portainer.io", description: "容器可视化管理", tags: ["工具", "面板"], internal_url: "http://192.168.1.10:9000" },
  { group: "docker", title: "Traefik", url: "https://traefik.io", description: "反向代理与路由", tags: ["代理"], internal_url: "http://192.168.1.10:8080" },
  { group: "docker", title: "Watchtower", url: "https://containrrr.dev/watchtower/", description: "自动更新容器镜像", tags: ["自动化"] },

  // NAS
  { group: "nas", title: "群晖官网", url: "https://www.synology.com", description: "Synology NAS", tags: ["nas"] },
  { group: "nas", title: "群晖 DSM 帮助", url: "https://kb.synology.com", description: "DSM 官方知识库", tags: ["nas", "文档"] },
  { group: "nas", title: "QNAP", url: "https://www.qnap.com", description: "QNAP NAS", tags: ["nas"] },
  { group: "nas", title: "TrueNAS", url: "https://www.truenas.com", description: "开源存储系统", tags: ["nas", "存储"] },
  { group: "nas", title: "Unraid", url: "https://unraid.net", description: "家用 NAS 操作系统", tags: ["nas"] },
  { group: "nas", title: "Nextcloud", url: "https://nextcloud.com", description: "私有云盘", tags: ["同步"], internal_url: "http://192.168.1.10:8081" },
  { group: "nas", title: "Immich", url: "https://immich.app", description: "相册备份方案", tags: ["照片"], internal_url: "http://192.168.1.10:2283" },
  { group: "nas", title: "Nginx Proxy Manager", url: "https://nginxproxymanager.com", description: "反向代理管理面板", tags: ["代理"], internal_url: "http://192.168.1.10:81" },

  // 运维监控
  { group: "ops", title: "Grafana", url: "https://grafana.com", description: "可视化监控面板", tags: ["监控"], internal_url: "http://192.168.1.10:3000" },
  { group: "ops", title: "Prometheus", url: "https://prometheus.io", description: "指标采集", tags: ["监控"] },
  { group: "ops", title: "Uptime Kuma", url: "https://github.com/louislam/uptime-kuma", description: "服务可用性监控", tags: ["监控"], internal_url: "http://192.168.1.10:3001" },
  { group: "ops", title: "Gitea", url: "https://about.gitea.com", description: "轻量自建 Git", tags: ["git"], internal_url: "http://192.168.1.10:3002" },
  { group: "ops", title: "Let's Encrypt", url: "https://letsencrypt.org", description: "免费证书", tags: ["证书"] },

  // AI
  { group: "ai", title: "Hugging Face", url: "https://huggingface.co", description: "模型与数据集社区", tags: ["模型"] },
  { group: "ai", title: "OpenAI Platform", url: "https://platform.openai.com", description: "OpenAI 开发者平台", tags: ["api"] },
  { group: "ai", title: "Claude", url: "https://claude.ai", description: "Anthropic 对话", tags: ["对话"] },
  { group: "ai", title: "Ollama", url: "https://ollama.com", description: "本地运行大模型", tags: ["本地", "模型"], internal_url: "http://192.168.1.10:11434" },
  { group: "ai", title: "LM Studio", url: "https://lmstudio.ai", description: "本地模型工作台", tags: ["本地"] },
  { group: "ai", title: "Replicate", url: "https://replicate.com", description: "模型 API 广场", tags: ["api"] },

  // 日常
  { group: "life", title: "Bilibili", url: "https://www.bilibili.com", description: "视频社区", tags: ["视频"] },
  { group: "life", title: "知乎", url: "https://www.zhihu.com", description: "问答社区", tags: ["问答"] },
  { group: "life", title: "少数派", url: "https://sspai.com", description: "效率工具与数字生活", tags: ["效率"] },
  { group: "life", title: "图床", url: "https://imgse.com", description: "图片托管", tags: ["工具"] },
];

interface CardSeed {
  kind: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

const CARDS: CardSeed[] = [
  {
    kind: "clock",
    title: "时钟",
    config: { format: "HH:mm", showDate: true, showSeconds: false },
    position: { x: 0, y: 0, w: 1, h: 1 },
  },
  {
    kind: "weather",
    title: "天气",
    config: { city: "深圳", placeholder: true },
    position: { x: 1, y: 0, w: 1, h: 1 },
  },
  {
    kind: "search",
    title: "搜索",
    config: { source: "Google", url: "https://www.google.com/search?q={q}" },
    position: { x: 2, y: 0, w: 2, h: 1 },
  },
  {
    kind: "note",
    title: "随手记",
    config: { body: "待办：\n- 检查 NAS 备份\n- 更新 Docker 镜像" },
    position: { x: 0, y: 1, w: 2, h: 1 },
  },
];

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 插入分组 / 书签 / 卡片种子（幂等：已存在的跳过）。 */
export function seedBookmarks() {
  const groupIds = new Map<string, string>();
  let createdGroups = 0;
  GROUPS.forEach((g, i) => {
    const found = db.prepare("SELECT id FROM groups WHERE name = ?").get(g.name) as
      | { id: string }
      | undefined;
    if (found) {
      groupIds.set(g.key, found.id);
      return;
    }
    const id = uid("g_");
    db.prepare(
      `INSERT INTO groups(id, name, icon, sort_order, visibility, owner_id, collapsed, created_at, updated_at)
       VALUES(?,?,?,?,?,?,0,?,?)`,
    ).run(id, g.name, g.icon, i, "public", null, now, now);
    groupIds.set(g.key, id);
    createdGroups++;
  });

  let createdBookmarks = 0;
  BOOKMARKS.forEach((b, i) => {
    const found = db.prepare("SELECT id FROM bookmarks WHERE title = ? AND url = ?").get(b.title, b.url);
    if (found) return;
    db.prepare(
      `INSERT INTO bookmarks(id, group_id, title, url, internal_url, description, icon, icon_color, tags, visibility, owner_id, sort_order, enabled, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,'public',NULL,?,1,?,?)`,
    ).run(
      uid("b_"),
      groupIds.get(b.group) ?? null,
      b.title,
      b.url,
      b.internal_url ?? null,
      b.description,
      "",
      "",
      JSON.stringify(b.tags),
      i,
      now,
      now,
    );
    createdBookmarks++;
  });

  let createdCards = 0;
  CARDS.forEach((c, i) => {
    const found = db.prepare("SELECT id FROM cards WHERE kind = ? AND title = ?").get(c.kind, c.title);
    if (found) return;
    db.prepare(
      `INSERT INTO cards(id, kind, title, config, position, visibility, owner_id, sort_order, created_at, updated_at)
       VALUES(?,?,?,?,?,'public',NULL,?,?,?)`,
    ).run(uid("c_"), c.kind, c.title, JSON.stringify(c.config), JSON.stringify(c.position), i, now, now);
    createdCards++;
  });

  console.log(
    `✔ 书签种子完成：新增分组 ${createdGroups}，新增书签 ${createdBookmarks}，新增卡片 ${createdCards}（已存在的跳过）。`,
  );
}

// 直接执行时运行
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/seed-bookmarks.ts")) {
  seedBookmarks();
  db.close();
}
