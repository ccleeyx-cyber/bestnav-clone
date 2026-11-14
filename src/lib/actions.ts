/**
 * 统一动作入口（actions）。
 *
 * BestNav 的设计要点：控制室 UI 与 MCP 触发的是**同一个执行入口**，
 * 不存在第二套逻辑；开关按风险三色分级；无权限的开关直接不列出（而非灰置泄露名称）。
 *
 * 本模块提供：
 *  - 风险分级 riskFor(switchId)
 *  - 按角色过滤可见开关 visibleSwitches(user)
 *  - 单一执行入口 performAction()，供 /api/actions 与 MCP 共用
 */
import type { User } from "@/lib/types";
import { isAdminRole } from "@/lib/rbac";
import {
  SWITCHES,
  getSwitch,
  previewSwitch,
  execSwitch,
  type SwitchDef,
  type SwitchOutcome,
} from "@/lib/control-room";

export type Risk = "safe" | "sensitive" | "danger";

export const RISK_LABELS: Record<Risk, string> = {
  safe: "安全",
  sensitive: "有感",
  danger: "高危",
};

/** 容器启停为有感；WOL 不可撤销按高危处理；其余按开关自身 impact。 */
export function riskFor(def: SwitchDef): Risk {
  if (def.id === "net.wol") return "danger";
  if (def.impact === "无感") return "safe";
  return "sensitive";
}

/**
 * 可见性：容器启停需要 Docker 操作权限（视为 monitoring.manage），
 * 其余（同步 / 备份 / 通知 / 唤醒 / 索引）要求管理员。
 */
export function canSeeSwitch(user: User | null, def: SwitchDef): boolean {
  if (!user) return false;
  if (def.kind === "docker") return isAdminRole(user);
  return isAdminRole(user);
}

export function visibleSwitches(user: User | null): SwitchDef[] {
  return SWITCHES.filter((s) => canSeeSwitch(user, s));
}

export interface ActionResult extends SwitchOutcome {
  risk: Risk;
  switchId: string;
  title: string;
}

/**
 * 统一执行入口。
 * @param source 触发来源，仅用于审计记账：ui | mcp | schedule | event
 */
export async function performAction(
  user: User | null,
  switchId: string,
  opts: { dryRun: boolean; params?: Record<string, unknown>; source?: string; ip?: string },
): Promise<ActionResult> {
  const def = getSwitch(switchId);
  if (!def) {
    return { ok: false, preview: {}, message: `未知开关：${switchId}`, risk: "safe", switchId, title: switchId };
  }
  if (!canSeeSwitch(user, def)) {
    return {
      ok: false,
      preview: {},
      message: "你没有执行该操作的权限。",
      risk: riskFor(def),
      switchId,
      title: def.title,
    };
  }
  const params = opts.params ?? {};
  const outcome = opts.dryRun ? await previewSwitch(def, params) : await execSwitch(def, params);
  return { ...outcome, risk: riskFor(def), switchId: def.id, title: def.title };
}
