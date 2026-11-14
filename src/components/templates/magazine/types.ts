import type { Bookmark } from "@/lib/types";

export interface MagazineGroup {
  id: string;
  name: string;
  icon: string;
  bookmarks: Bookmark[];
}

/**
 * 杂志流模板的数据契约。
 * 由 server component（src/app/template-preview/page.tsx 或书签队友的页面）填充。
 */
export interface MagazineData {
  /** 头条卡片：标题、摘要、封面（可选）。 */
  headline: {
    title: string;
    summary: string;
    cover?: string;
    link?: string;
    tag?: string;
  };
  /** 杂志分栏。 */
  columns: MagazineGroup[];
  /** 侧栏：次要链接。 */
  sidebar: Bookmark[];
  updatedAt?: string;
}

export const EMPTY_MAGAZINE: MagazineData = {
  headline: { title: "还没有头条", summary: "在书签里把任意链接设为头条，它会出现在这里。", tag: "头条" },
  columns: [],
  sidebar: [],
};
