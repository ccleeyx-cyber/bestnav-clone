import type { User } from "@/lib/types";
import {
  canReadRow as canReadRowShared,
  canWriteRow as canWriteRowShared,
  visibleWhere as visibleWhereShared,
  type VisibleWhere,
} from "@/lib/visibility";

export interface VisibilityRow {
  visibility: string;
  owner_id: string | null;
}

/**
 * SQL 片段，限制返回当前用户可见的行。
 * 委托给 @/lib/visibility 的统一实现（owner/admin 全量，member 见自己，匿名仅 public）。
 */
export function visibleWhere(u: User | null, table: "bookmarks" | "groups" | "cards"): VisibleWhere {
  return visibleWhereShared(u, table);
}

/** 单行读权限。 */
export function canRead(row: VisibilityRow, u: User | null): boolean {
  return canReadRowShared(row, u);
}

/** 单行写权限：资源所有者本人或 admin/owner。 */
export function canWrite(row: VisibilityRow, u: User | null): boolean {
  return canWriteRowShared(row, u);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}
