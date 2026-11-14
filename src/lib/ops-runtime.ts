/**
 * Operational helpers used by the control room.
 *
 * Docker auto-discovery lives in ./docker-bookmarks.ts
 * WOL lives in ./wol.ts
 * Backup lives in ./backup.ts
 */
import { now, one, rows, run } from "./db";

/* --------------------------- monitor index --------------------------- */

export type IndexResult = { ok: boolean; message: string; updated: number };

/**
 * Re-check every http monitor and refresh its status/latency snapshot.
 */
export async function rebuildMonitorIndex(): Promise<IndexResult> {
  try {
    const all = rows<{ id: string }>("SELECT id FROM monitors WHERE kind = 'http'");
    let updated = 0;
    for (const m of all) {
      const target = one<{ target: string }>("SELECT target FROM monitors WHERE id = ?", m.id);
      const url = target?.target;
      if (!url) continue;
      let status = "unknown";
      let detail = "";
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const res = await fetch(url, { method: "GET", signal: ac.signal, redirect: "follow" });
        clearTimeout(t);
        status = res.ok ? "up" : "down";
        detail = String(res.status);
      } catch (e) {
        status = "down";
        detail = (e as Error).name ?? "error";
      }
      run(
        "UPDATE monitors SET last_status=?, last_checked_at=?, last_detail=?, updated_at=? WHERE id=?",
        status,
        now(),
        JSON.stringify({ status, detail }),
        now(),
        m.id,
      );
      updated++;
    }
    return { ok: true, message: `已重建 ${updated} 个 http 监控索引。`, updated };
  } catch (e) {
    return { ok: false, message: `重建索引失败：${(e as Error).message}`, updated: 0 };
  }
}
