/**
 * 可见性过滤的统一工具函数。
 *
 * 语义：
 *  - owner / admin：看全部（1 = 1）
 *  - member：visibility = 'public' OR owner_id = :自己
 *  - 未登录：只看 visibility = 'public'
 *
 * 用法（务必把 params 紧跟在 sql 片段出现的位置之后拼接）：
 *   const v = visibleWhere(user, "bookmarks");
 *   rows(`SELECT * FROM bookmarks b WHERE ${v.sql} ORDER BY b.sort_order`, ...v.params);
 *
 * 三张表列名一致（visibility / owner_id），故共用实现；table 参数用于校验与未来分叉。
 */
import type { User } from "@/lib/types";

export type VisibleTable = "bookmarks" | "groups" | "cards";

const TABLES: VisibleTable[] = ["bookmarks", "groups", "cards"];

export interface VisibleWhere {
  sql: string;
  params: unknown[];
}

export function visibleWhere(user: User | null, table: VisibleTable): VisibleWhere {
  if (!TABLES.includes(table)) {
    throw new Error(`visibleWhere 不支持的表: ${table}`);
  }
  if (!user) return { sql: "visibility = 'public'", params: [] };
  if (user.role === "owner" || user.role === "admin") return { sql: "1 = 1", params: [] };
  return {
    sql: "(visibility = 'public' OR owner_id = ?)",
    params: [user.id],
  };
}

/** 单行读权限。 */
export function canReadRow(
  row: { visibility: string; owner_id: string | null },
  user: User | null,
): boolean {
  if (row.visibility === "public") return true;
  if (!user) return false;
  if (row.owner_id && row.owner_id === user.id) return true;
  return user.role === "owner" || user.role === "admin";
}

/** 单行写权限：owner 本人，或 admin/owner。 */
export function canWriteRow(
  row: { visibility: string; owner_id: string | null },
  user: User | null,
): boolean {
  if (!user) return false;
  if (row.owner_id && row.owner_id === user.id) return true;
  return user.role === "owner" || user.role === "admin";
}

/** 是否可修改该行所属资源的可见性（只有 owner 本人或管理员可改）。 */
export function canSetVisibility(
  row: { visibility?: string; owner_id: string | null },
  user: User | null,
): boolean {
  if (!user) return false;
  if (row.owner_id && row.owner_id === user.id) return true;
  return user.role === "owner" || user.role === "admin";
}

/**
 * 便捷写权限判定：owner/admin 恒 true；
 * member 只有在该行属于自己（ownerId === user.id）时为 true。
 * ownerId 为 null 的行视为公共资源，仅管理员可改。
 */
export function canEdit(user: User | null, ownerId: string | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "owner" || user.role === "admin") return true;
  if (!ownerId) return false;
  return ownerId === user.id;
}
