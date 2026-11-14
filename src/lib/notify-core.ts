/**
 * 通知核心。真实实现：src/lib/notify.ts（运维监控模块）。
 */
export async function sendTestNotification(): Promise<{ ok: number; fail: number }> {
  const mod = await import("./notify");
  return mod.sendTestNotification();
}
