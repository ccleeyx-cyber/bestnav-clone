export interface ConsoleGroup {
  id: string;
  name: string;
  icon: string;
  items: { id: string; title: string; url: string; status?: string }[];
}

export interface ConsoleData {
  containers: { name: string; status: string; image?: string }[];
  host: { cpu: number; mem: number; disk: number; load?: string; uptime?: string };
  certs: { domain: string; daysLeft: number | null; issuer?: string }[];
  visitors: { todayPv: number; todayUv: number; totalUv: number };
  logs: { ts: string; level: string; message: string }[];
  groups: ConsoleGroup[];
  /** 外部 API 不可用时的占位提示。 */
  degraded: string[];
}

/**
 * 控制台模板的数据契约。
 * 所有面板数据都从外部 API / db 取得；不可用时用 degraded 说明，并在面板里显示占位。
 */
export const EMPTY_CONSOLE: ConsoleData = {
  containers: [],
  host: { cpu: 0, mem: 0, disk: 0 },
  certs: [],
  visitors: { todayPv: 0, todayUv: 0, totalUv: 0 },
  logs: [],
  groups: [],
  degraded: [],
};
