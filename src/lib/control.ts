/**
 * 控制室适配层。
 *
 * 真实实现位于 src/lib/control-room.ts（运维监控模块负责）。
 * 这里只做两件事：
 *  1. 给 MCP / 控制室页面提供带「最近触发时间」的开关目录；
 *  2. 把 runSwitch 的签名包装成 MCP 需要的形态。
 */
import type { User } from "./auth";
import { rows } from "./db";
import {
  SWITCHES,
  getSwitch,
  runSwitch as runSwitchRaw,
  type SwitchDef,
} from "./control-room";

export type { SwitchDef };
export { SWITCHES };

export type SwitchOutcome = {
  ok: boolean;
  preview: Record<string, unknown>;
  message: string;
};

export function getSwitchCatalog(): (SwitchDef & { last_triggered_at?: string | null })[] {
  const recent = rows<{ target: string; created_at: string }>(
    "SELECT target, created_at FROM audit_logs WHERE action = 'control.exec' ORDER BY created_at DESC LIMIT 300",
  );
  const last: Record<string, string> = {};
  for (const r of recent) {
    const id = r.target;
    if (id && !(id in last)) last[id] = r.created_at;
  }
  return SWITCHES.map((s) => ({ ...s, last_triggered_at: last[s.id] ?? null }));
}

export async function runSwitch(
  switchId: string,
  opts: { dryRun: boolean; params: Record<string, unknown>; user?: User | null; ip?: string },
): Promise<SwitchOutcome> {
  const def = getSwitch(switchId);
  if (!def) return { ok: false, preview: {}, message: `未知开关：${switchId}` };
  return runSwitchRaw(opts.user?.id ?? null, switchId, !!opts.dryRun, opts.params ?? {}, opts.ip ?? "");
}
