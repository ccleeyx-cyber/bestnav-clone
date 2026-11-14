export interface BookmarkItem {
  id: string;
  group_id: string | null;
  title: string;
  url: string;
  internal_url: string | null;
  description: string;
  icon: string;
  icon_color: string;
  tags: string[];
  visibility: "public" | "private";
  owner_id: string | null;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface GroupItem {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  visibility: "public" | "private";
  collapsed: number;
  bookmarks: BookmarkItem[];
}

export interface CardItem {
  id: string;
  kind: string;
  title: string;
  config: Record<string, unknown>;
  position: { x?: number; y?: number; w?: number; h?: number; template?: string };
  visibility: "public" | "private";
  owner_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 取域名用于 favicon。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=64`;
}

/** 从 domain 推导一个稳定的字母块颜色。 */
export function letterColor(url: string): string {
  const d = domainOf(url);
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 62% 52%)`;
}

export function initialOf(title: string): string {
  const t = (title ?? "").trim();
  if (!t) return "•";
  return t.slice(0, 1).toUpperCase();
}

/**
 * 拼音/模糊匹配：中文按首字 + 子串，英文不区分大小写。
 * 无外部依赖的轻量实现：逐字符匹配 + 包含匹配 + 子序列匹配。
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;
  // 子序列匹配（fuzzy）
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function matchBookmark(b: BookmarkItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (fuzzyMatch(q, b.title)) return true;
  if (fuzzyMatch(q, b.description)) return true;
  if (fuzzyMatch(q, b.url)) return true;
  if (b.internal_url && fuzzyMatch(q, b.internal_url)) return true;
  return b.tags.some((t) => fuzzyMatch(q, t));
}

/** 当前是否处于公网环境（粗略判断：非 localhost / 非私网 IP）。 */
export function isPublicNetwork(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
  if (h === "::1") return false;
  if (/^10\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/\.local$/.test(h)) return false;
  return true;
}

/**
 * 解析点击目标：如果设置了 internal_url 且当前在公网、且设置为"内网优先"，
 * 则跳到内网地址。
 */
export function resolveTarget(
  b: BookmarkItem,
  mode: "auto" | "internal" | "public",
  onPublic: boolean,
): string {
  if (!b.internal_url) return b.url;
  if (mode === "internal") return b.internal_url;
  if (mode === "public") return b.url;
  // auto：内网地址在公网不可达 → 用公网地址；反之亦然
  if (onPublic) {
    const internalHost = domainOf(b.internal_url);
    return isPublicNetwork(internalHost) ? b.internal_url : b.url;
  }
  return b.internal_url;
}
