/**
 * 备份核心。真实实现：src/lib/backup.ts（平台模块）。
 */
export async function createBackup(kind: string): Promise<string> {
  const mod = await import("./backup");
  return mod.createBackup(kind);
}
