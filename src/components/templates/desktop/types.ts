export interface DesktopApp {
  id: string;
  name: string;
  icon: string;
  /** 窗口内容类型。 */
  kind: "links" | "text" | "grid";
  /** kind=links 时的链接列表。 */
  items?: { id: string; title: string; url: string }[];
  /** kind=text 时的正文。 */
  text?: string;
  /** kind=grid 时的分组。 */
  groups?: {
    id: string;
    name: string;
    icon: string;
    items: { id: string; title: string; url: string }[];
  }[];
}

export interface DesktopData {
  apps: DesktopApp[];
  wallpaper?: string;
}

/**
 * 桌面窗口 + Dock 模板的数据契约。
 * 每个 app 对应一个可拖动/最小化/最大化的窗口；Dock 是底部应用切换器。
 */
export const EMPTY_DESKTOP: DesktopData = { apps: [] };
