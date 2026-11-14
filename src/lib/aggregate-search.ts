/**
 * 12 分类聚合搜索。
 *
 * 设计要点：
 * - 12 个固定分类，源来自 DB（search_sources）＋ 内置本地兜底源。
 * - 每次搜索对同一分类下的所有启用源并发请求，单源 5s 超时，单源失败不影响其它源。
 * - 解析通用：优先 JSON/XML 特化解析器，其次轻量 HTML <a> 抽取，最后退化为「跳转链接 + 源名」。
 * - 网络全挂时依然有本地兜底源保证页面不空。
 */

import { rows, one, run, now, uid } from "./db";
import {
  CATEGORIES,
  CATEGORY_IDS,
  isCategory,
  LOCAL_FALLBACK,
  type BuiltinSource,
  type CategoryId,
  type SearchItem,
  type SourceResult,
  type SearchResult,
} from "./search-categories";

export type { CategoryId, SearchItem, SourceResult, SearchResult, BuiltinSource } from "./search-categories";
export { CATEGORIES, CATEGORY_IDS, isCategory, LOCAL_FALLBACK } from "./search-categories";

/** 每个分类的「本地兜底直达」搜索 URL —— 纯字符串拼接，不依赖网络。 */

export const LOCAL_SOURCE_NAME = "本地直达";

/** 内置源（与 scripts/seed.ts 的种子数据保持一致）。 */
export const BUILTIN_SOURCES: BuiltinSource[] = [
  // web
  { id: "web-google", category: "web", name: "Google", url_template: "https://www.google.com/search?q={q}", icon: "🔍", sort_order: 10 },
  { id: "web-bing", category: "web", name: "Bing", url_template: "https://www.bing.com/search?q={q}", icon: "🔎", sort_order: 20 },
  { id: "web-ddg", category: "web", name: "DuckDuckGo", url_template: "https://duckduckgo.com/?q={q}", icon: "🦆", sort_order: 30 },
  { id: "web-baidu", category: "web", name: "百度", url_template: "https://www.baidu.com/s?wd={q}", icon: "🐻", sort_order: 40 },
  { id: "web-so", category: "web", name: "搜狗", url_template: "https://www.sogou.com/web?query={q}", icon: "🐶", sort_order: 50 },
  // music
  { id: "music-163", category: "music", name: "网易云音乐", url_template: "https://music.163.com/#/search/m/?s={q}", icon: "🎼", sort_order: 10 },
  { id: "music-qq", category: "music", name: "QQ音乐", url_template: "https://y.qq.com/search?w={q}", icon: "🎹", sort_order: 20 },
  { id: "music-spotify", category: "music", name: "Spotify", url_template: "https://open.spotify.com/search/{q}", icon: "🟢", sort_order: 30 },
  { id: "music-youtube-music", category: "music", name: "YouTube Music", url_template: "https://music.youtube.com/search?q={q}", icon: "▶️", sort_order: 40 },
  { id: "music-yt-dl", category: "music", name: "YT Music Downloader", url_template: "https://ytmd.ltd/search?q={q}", icon: "⬇️", sort_order: 50 },
  // movie
  { id: "movie-douban", category: "movie", name: "豆瓣电影", url_template: "https://search.douban.com/movie/subject_search?search_text={q}", icon: "🎞️", sort_order: 10 },
  { id: "movie-mtime", category: "movie", name: "时光网", url_template: "https://search.mtime.com/search/?q={q}", icon: "⏳", sort_order: 20 },
  { id: "movie-imdb", category: "movie", name: "IMDb", url_template: "https://www.imdb.com/find/?q={q}", icon: "⭐", sort_order: 30 },
  { id: "movie-youtube", category: "movie", name: "YouTube 影视", url_template: "https://www.youtube.com/results?search_query={q}+movie", icon: "📺", sort_order: 40 },
  { id: "movie-tencent", category: "movie", name: "腾讯视频", url_template: "https://v.qq.com/x/search/?q={q}", icon: "🐧", sort_order: 50 },
  // book
  { id: "book-douban", category: "book", name: "豆瓣读书", url_template: "https://search.douban.com/book/subject_search?search_text={q}", icon: "📖", sort_order: 10 },
  { id: "book-weread", category: "book", name: "微信读书", url_template: "https://weread.qq.com/web/search/books?keyword={q}", icon: "💚", sort_order: 20 },
  { id: "book-openlibrary", category: "book", name: "Open Library", url_template: "https://openlibrary.org/search.json?q={q}", icon: "📚", sort_order: 30 },
  { id: "book-douban-dw", category: "book", name: "豆瓣电子书", url_template: "https://read.douban.com/search?q={q}", icon: "🅰️", sort_order: 40 },
  { id: "book-gutenberg", category: "book", name: "古登堡计划", url_template: "https://www.gutenberg.org/ebooks/search/?query={q}", icon: "🏛️", sort_order: 50 },
  // doc
  { id: "doc-baiduwenku", category: "doc", name: "百度文库", url_template: "https://wenku.baidu.com/search?word={q}", icon: "📘", sort_order: 10 },
  { id: "doc-zhihu", category: "doc", name: "知乎", url_template: "https://www.zhihu.com/search?type=content&q={q}", icon: "🔵", sort_order: 20 },
  { id: "doc-doc88", category: "doc", name: "道客巴巴", url_template: "https://www.doc88.com/tag/{q}", icon: "🗂️", sort_order: 30 },
  { id: "doc-slideshare", category: "doc", name: "SlideShare", url_template: "https://www.slideshare.net/search/slideshow?searchfrom=header&q={q}", icon: "📊", sort_order: 40 },
  { id: "doc-scribd", category: "doc", name: "Scribd", url_template: "https://www.scribd.com/search?query={q}", icon: "✍️", sort_order: 50 },
  // paper
  { id: "paper-scholar", category: "paper", name: "Google Scholar", url_template: "https://scholar.google.com/scholar?q={q}", icon: "🎓", sort_order: 10 },
  { id: "paper-baidu-xueshu", category: "paper", name: "百度学术", url_template: "https://xueshu.baidu.com/s?wd={q}", icon: "🔬", sort_order: 20 },
  { id: "paper-arxiv", category: "paper", name: "arXiv", url_template: "https://export.arxiv.org/api/query?search_query=all:{q}&start=0&max_results=10", icon: "🧪", sort_order: 30 },
  { id: "paper-semanticscholar", category: "paper", name: "Semantic Scholar", url_template: "https://www.semanticscholar.org/search?q={q}", icon: "🌐", sort_order: 40 },
  { id: "paper-pubmed", category: "paper", name: "PubMed", url_template: "https://pubmed.ncbi.nlm.nih.gov/?term={q}", icon: "🩺", sort_order: 50 },
  // image
  { id: "image-unsplash", category: "image", name: "Unsplash", url_template: "https://unsplash.com/s/photos/{q}", icon: "🖼️", sort_order: 10 },
  { id: "image-pexels", category: "image", name: "Pexels", url_template: "https://www.pexels.com/search/{q}/", icon: "📷", sort_order: 20 },
  { id: "image-pixabay", category: "image", name: "Pixabay", url_template: "https://pixabay.com/images/search/{q}/", icon: "🪄", sort_order: 30 },
  { id: "image-bing", category: "image", name: "Bing 图片", url_template: "https://www.bing.com/images/search?q={q}", icon: "🔷", sort_order: 40 },
  { id: "image-openverse", category: "image", name: "Openverse", url_template: "https://openverse.org/search?q={q}", icon: "🅾️", sort_order: 50 },
  // video
  { id: "video-youtube", category: "video", name: "YouTube", url_template: "https://www.youtube.com/results?search_query={q}", icon: "▶️", sort_order: 10 },
  { id: "video-bilibili", category: "video", name: "哔哩哔哩", url_template: "https://search.bilibili.com/all?keyword={q}", icon: "📺", sort_order: 20 },
  { id: "video-vimeo", category: "video", name: "Vimeo", url_template: "https://vimeo.com/search?q={q}", icon: "🎥", sort_order: 30 },
  { id: "video-ted", category: "video", name: "TED", url_template: "https://www.ted.com/search?q={q}", icon: "💡", sort_order: 40 },
  { id: "video-douyin", category: "video", name: "抖音", url_template: "https://www.douyin.com/search/{q}", icon: "🎶", sort_order: 50 },
  // file
  { id: "file-baidu-pan", category: "file", name: "百度网盘", url_template: "https://pan.baidu.com/s?kw={q}", icon: "☁️", sort_order: 10 },
  { id: "file-weiyun", category: "file", name: "腾讯微云", url_template: "https://share.weiyun.com/search?q={q}", icon: "🌥️", sort_order: 20 },
  { id: "file-alipan", category: "file", name: "阿里云盘", url_template: "https://www.alipan.com/s/{q}", icon: "🅰️", sort_order: 30 },
  { id: "file-csdn", category: "file", name: "CSDN 下载", url_template: "https://so.csdn.net/so/search?q={q}", icon: "🟧", sort_order: 40 },
  { id: "file-gitee", category: "file", name: "Gitee", url_template: "https://search.gitee.com/?skin=rec&type=repository&q={q}", icon: "🧿", sort_order: 50 },
  // software
  { id: "software-github", category: "software", name: "GitHub", url_template: "https://github.com/search?q={q}", icon: "🐙", sort_order: 10 },
  { id: "software-sourceforge", category: "software", name: "SourceForge", url_template: "https://sourceforge.net/directory/?q={q}", icon: "🧱", sort_order: 20 },
  { id: "software-gitlab", category: "software", name: "GitLab", url_template: "https://gitlab.com/search?search={q}", icon: "🦊", sort_order: 30 },
  { id: "software-npm", category: "software", name: "npm", url_template: "https://www.npmjs.com/search?q={q}", icon: "📦", sort_order: 40 },
  { id: "software-pypi", category: "software", name: "PyPI", url_template: "https://pypi.org/search/?q={q}", icon: "🐍", sort_order: 50 },
  // skill
  { id: "skill-promptbase", category: "skill", name: "PromptBase", url_template: "https://promptbase.com/search?q={q}", icon: "🪄", sort_order: 10 },
  { id: "skill-awesome-llm", category: "skill", name: "Awesome-LLM", url_template: "https://github.com/search?q={q}+awesome+llm", icon: "✨", sort_order: 20 },
  { id: "skill-flowise", category: "skill", name: "Flowise", url_template: "https://flowiseai.com/?search={q}", icon: "🌊", sort_order: 30 },
  { id: "skill-langchain", category: "skill", name: "LangChain", url_template: "https://python.langchain.com/search?q={q}", icon: "🦜", sort_order: 40 },
  { id: "skill-librechat", category: "skill", name: "LibreChat", url_template: "https://librechat.ai/?q={q}", icon: "💬", sort_order: 50 },
  // ai
  { id: "ai-huggingface", category: "ai", name: "HuggingFace", url_template: "https://huggingface.co/models?search={q}", icon: "🤗", sort_order: 10 },
  { id: "ai-replicate", category: "ai", name: "Replicate", url_template: "https://replicate.com/search?query={q}", icon: "♾️", sort_order: 20 },
  { id: "ai-modelscope", category: "ai", name: "ModelScope", url_template: "https://modelscope.cn/models?name={q}", icon: "🀄", sort_order: 30 },
  { id: "ai-openrouter", category: "ai", name: "OpenRouter", url_template: "https://openrouter.ai/models?q={q}", icon: "🛣️", sort_order: 40 },
  { id: "ai-ollama", category: "ai", name: "Ollama", url_template: "https://ollama.com/search?q={q}", icon: "🦙", sort_order: 50 },
];

const SOURCE_TIMEOUT_MS = 5000;
const MAX_ITEMS_PER_SOURCE = 10;

interface DbSource {
  id: string;
  category: string;
  name: string;
  url_template: string;
  icon: string;
  sort_order: number;
  enabled: number;
}

/** 保证内置源存在于 DB（幂等）。用户可在 DB 里覆盖/禁用/删除。 */
export function ensureBuiltinSources(): void {
  for (const s of BUILTIN_SOURCES) {
    run(
      `INSERT INTO search_sources(id, category, name, url_template, icon, sort_order, enabled, created_at)
       VALUES(?,?,?,?,?,?,1,?)
       ON CONFLICT(id) DO NOTHING`,
      s.id,
      s.category,
      s.name,
      s.url_template,
      s.icon,
      s.sort_order,
      now(),
    );
  }
}

export function listSources(category?: string): DbSource[] {
  ensureBuiltinSources();
  if (category && isCategory(category)) {
    return rows<DbSource>(
      "SELECT * FROM search_sources WHERE category = ? ORDER BY sort_order ASC, name ASC",
      category,
    );
  }
  return rows<DbSource>("SELECT * FROM search_sources ORDER BY category ASC, sort_order ASC, name ASC");
}

export function getSource(id: string): DbSource | undefined {
  return one<DbSource>("SELECT * FROM search_sources WHERE id = ?", id);
}

export function createSource(input: {
  category: string;
  name: string;
  url_template: string;
  icon?: string;
  sort_order?: number;
  enabled?: boolean;
}): DbSource {
  ensureBuiltinSources();
  const id = `custom-${uid("s_")}`;
  const ts = now();
  run(
    `INSERT INTO search_sources(id, category, name, url_template, icon, sort_order, enabled, created_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    id,
    input.category,
    input.name,
    input.url_template,
    input.icon ?? "",
    input.sort_order ?? 0,
    input.enabled === false ? 0 : 1,
    ts,
  );
  return getSource(id)!;
}

export function updateSource(
  id: string,
  patch: Partial<{ category: string; name: string; url_template: string; icon: string; sort_order: number; enabled: boolean }>,
): DbSource | undefined {
  const cur = getSource(id);
  if (!cur) return undefined;
  run(
    `UPDATE search_sources SET category=?, name=?, url_template=?, icon=?, sort_order=?, enabled=? WHERE id=?`,
    patch.category ?? cur.category,
    patch.name ?? cur.name,
    patch.url_template ?? cur.url_template,
    patch.icon ?? cur.icon,
    patch.sort_order ?? cur.sort_order,
    patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
    id,
  );
  return getSource(id);
}

export function deleteSource(id: string): boolean {
  const cur = getSource(id);
  if (!cur) return false;
  run("DELETE FROM search_sources WHERE id = ?", id);
  return true;
}

export function buildUrl(template: string, q: string): string {
  return template.replace(/\{q\}/g, encodeURIComponent(q)).replace(/\{kw\}/g, encodeURIComponent(q));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** 轻量 HTML 解析：抽取 <a href> + 链接文本。 */
export function parseHtmlLinks(html: string, baseHost?: string): SearchItem[] {
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (!hrefMatch) continue;
    const rawHref = (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) continue;
    let href = rawHref;
    if (href.startsWith("/") && baseHost) href = baseHost + href;
    if (!/^https?:\/\//i.test(href)) continue;
    href = href.split("#")[0]!;
    if (seen.has(href)) continue;
    const title = decodeEntities(stripTags(inner)).trim();
    if (title.length < 2) continue;
    seen.add(href);
    items.push({ title: title.slice(0, 160), url: href, desc: "" });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

function parseArxiv(xml: string): SearchItem[] {
  const items: SearchItem[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1] ?? "";
    const title = decodeEntities(stripTags(/<title>([\s\S]*?)<\/title>/i.exec(entry)?.[1] ?? "")).trim();
    const id = stripTags(/<id>([\s\S]*?)<\/id>/i.exec(entry)?.[1] ?? "").trim();
    const summary = decodeEntities(stripTags(/<summary>([\s\S]*?)<\/summary>/i.exec(entry)?.[1] ?? "")).trim();
    if (!title) continue;
    items.push({
      title: title.slice(0, 160),
      url: id || "https://arxiv.org",
      desc: summary.slice(0, 220),
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

function parseOpenLibrary(json: string): SearchItem[] {
  try {
    const data = JSON.parse(json) as { docs?: { title?: string; key?: string; author_name?: string[]; first_publish_year?: number }[] };
    return (data.docs ?? []).slice(0, MAX_ITEMS_PER_SOURCE).map((d) => ({
      title: (d.title ?? "未命名").slice(0, 160),
      url: d.key ? `https://openlibrary.org${d.key}` : "https://openlibrary.org",
      desc: [d.author_name?.slice(0, 3).join(", "), d.first_publish_year ? String(d.first_publish_year) : ""]
        .filter(Boolean)
        .join(" · "),
    }));
  } catch {
    return [];
  }
}

function parseJsonGeneric(json: string): SearchItem[] {
  try {
    const data = JSON.parse(json) as unknown;
    const out: SearchItem[] = [];
    const push = (title: unknown, url: unknown, desc: unknown) => {
      if (typeof title === "string" && title.trim() && typeof url === "string" && url.trim()) {
        out.push({ title: title.trim().slice(0, 160), url: url.trim(), desc: typeof desc === "string" ? desc.slice(0, 220) : "" });
      }
    };
    const visit = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        const title = o.title ?? o.name ?? o.label ?? o.heading;
        const url = o.url ?? o.link ?? o.href ?? o.permalink ?? o.id;
        const desc = o.description ?? o.summary ?? o.excerpt ?? o.snippet ?? o.content;
        if (title !== undefined && url !== undefined) push(title, url, desc);
      }
    };
    visit(data);
    return out.slice(0, MAX_ITEMS_PER_SOURCE);
  } catch {
    return [];
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<{ text: string; contentType: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    const text = await res.text();
    return { text, contentType: res.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(timer);
  }
}

async function querySource(source: DbSource, q: string): Promise<SourceResult> {
  const target = buildUrl(source.url_template, q);
  try {
    const { text, contentType } = await fetchWithTimeout(target, SOURCE_TIMEOUT_MS);
    let items: SearchItem[] = [];
    if (source.id === "paper-arxiv" || text.includes("<entry>")) {
      items = parseArxiv(text);
    } else if (source.id === "book-openlibrary" || contentType.includes("application/json")) {
      items = parseOpenLibrary(text);
      if (!items.length) items = parseJsonGeneric(text);
    } else {
      items = parseHtmlLinks(text, safeHost(target));
    }
    if (!items.length) items = parseJsonGeneric(text);
    if (!items.length) {
      return {
        source: source.name,
        items: [{ title: `在 ${source.name} 搜索「${q}」`, url: target, desc: "未解析出结果，点击直达搜索页" }],
      };
    }
    return { source: source.name, items };
  } catch (err) {
    return {
      source: source.name,
      items: [{ title: `在 ${source.name} 搜索「${q}」`, url: target, desc: "源请求失败，已降级为直达链接" }],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function safeHost(url: string): string | undefined {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
  }
}

/** 本地兜底源：不发网络请求，直接给出各分类的通用直达链接。 */
export function localFallbackSource(category: CategoryId): SourceResult {
  const template = LOCAL_FALLBACK[category];
  return {
    source: LOCAL_SOURCE_NAME,
    items: [
      {
        title: `直达 ${CATEGORIES.find((c) => c.id === category)?.label ?? category} 搜索：{q}`,
        url: template.replace(/\{q\}/g, encodeURIComponent("{q}")),
        desc: "本地兜底源：网络不可用时依然可用",
      },
    ],
  };
}

export interface SearchOptions {
  /** 覆盖 DB 源（便于测试）。 */
  sources?: DbSource[];
  timeoutMs?: number;
}

export async function aggregateSearch(
  category: CategoryId,
  q: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const query = q.trim();
  const sources = (options.sources ?? listSources(category)).filter((s) => s.enabled !== 0);
  const local = localFallbackSource(category);
  if (!query) {
    return {
      category,
      results: [
        ...sources.map((s) => ({
          source: s.name,
          items: [{ title: `在 ${s.name} 搜索`, url: buildUrl(s.url_template, ""), desc: "输入关键词开始搜索" }],
        })),
        local,
      ],
    };
  }
  const settled = await Promise.all(
    sources.map(async (s) => {
      try {
        return await querySource(s, query);
      } catch (err) {
        return {
          source: s.name,
          items: [{ title: `在 ${s.name} 搜索「${query}」`, url: buildUrl(s.url_template, query), desc: "源请求失败" }],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return { category, results: [...settled, local] };
}

