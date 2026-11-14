/**
 * 聚合搜索的**纯常量与纯类型**模块。
 *
 * 独立出来是为了让客户端组件可以直接 import —— 它不依赖 node:fs / node:sqlite，
 * 不会把服务端模块拖进浏览器 bundle。
 */

export type CategoryId =
  | "web"
  | "music"
  | "movie"
  | "book"
  | "doc"
  | "paper"
  | "image"
  | "video"
  | "file"
  | "software"
  | "skill"
  | "ai";

export interface SearchItem {
  title: string;
  url: string;
  desc: string;
  image?: string;
}

export interface SourceResult {
  source: string;
  items: SearchItem[];
  error?: string;
}

export interface SearchResult {
  category: string;
  results: SourceResult[];
}

export interface BuiltinSource {
  id: string;
  category: CategoryId;
  name: string;
  url_template: string;
  icon: string;
  sort_order: number;
}

export const CATEGORIES: { id: CategoryId; label: string; icon: string; desc: string }[] = [
  { id: "web", label: "网页", icon: "🌐", desc: "全网通用网页搜索" },
  { id: "music", label: "音乐", icon: "🎵", desc: "音乐与音频平台" },
  { id: "movie", label: "影视", icon: "🎬", desc: "电影与剧集" },
  { id: "book", label: "图书", icon: "📚", desc: "书籍与电子书" },
  { id: "doc", label: "文档", icon: "📄", desc: "文档与知识库" },
  { id: "paper", label: "论文", icon: "📰", desc: "学术论文与预印本" },
  { id: "image", label: "图片", icon: "🖼️", desc: "免费图片素材" },
  { id: "video", label: "视频", icon: "📹", desc: "视频与短视频平台" },
  { id: "file", label: "网盘", icon: "💾", desc: "网盘与文件检索" },
  { id: "software", label: "软件", icon: "🧩", desc: "开源软件与下载" },
  { id: "skill", label: "技能", icon: "🧠", desc: "提示词与技能包" },
  { id: "ai", label: "AI", icon: "🤖", desc: "模型、数据集与 AI 服务" },
];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export function isCategory(v: string): v is CategoryId {
  return (CATEGORY_IDS as string[]).includes(v);
}

/** 每个分类的「本地兜底直达」搜索 URL —— 纯字符串拼接，不依赖网络。 */
export const LOCAL_FALLBACK: Record<CategoryId, string> = {
  web: "https://www.google.com/search?q={q}",
  music: "https://music.163.com/#/search/m/?s={q}",
  movie: "https://search.douban.com/movie/subject_search?search_text={q}",
  book: "https://search.douban.com/book/subject_search?search_text={q}",
  doc: "https://wenku.baidu.com/search?word={q}",
  paper: "https://scholar.google.com/scholar?q={q}",
  image: "https://unsplash.com/s/photos/{q}",
  video: "https://www.youtube.com/results?search_query={q}",
  file: "https://pan.baidu.com/s?kw={q}",
  software: "https://github.com/search?q={q}",
  skill: "https://promptbase.com/search?q={q}",
  ai: "https://huggingface.co/models?search={q}",
};
