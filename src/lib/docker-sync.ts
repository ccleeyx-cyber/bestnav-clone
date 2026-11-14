/**
 * Docker 容器 → 导航书签的自动同步。
 * 真实实现：src/lib/docker-bookmarks.ts（运维监控模块）。
 */
export interface SyncResult {
  added: number;
  skipped: number;
}

export async function syncDockerBookmarks(): Promise<SyncResult> {
  const mod = await import("./docker-bookmarks");
  return mod.syncDockerBookmarks();
}
