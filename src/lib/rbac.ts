/**
 * 多用户 RBAC 权限矩阵。
 *
 * 角色：owner / admin / member
 *  - owner：一切权限，且账号不可被删除。
 *  - admin：管理用户、书签、卡片、设置、监控、工具、备份；不能改动 owner。
 *  - member：只能改自己的私有资源；能读公开区；能看自己的审计记录。
 *
 * 本文件是纯逻辑，不碰数据库，方便服务端与客户端共用。
 */
import type { Role, User } from "@/lib/types";

export type Permission =
  | "users.manage"
  | "bookmarks.manage"
  | "cards.manage"
  | "groups.manage"
  | "settings.manage"
  | "monitoring.manage"
  | "tools.manage"
  | "backup.manage"
  | "audit.viewAll"
  | "audit.viewOwn"
  | "audit.purge"
  | "notes.manage"
  | "calendar.manage"
  | "private.write";

export const ROLES: Role[] = ["owner", "admin", "member"];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "users.manage": "管理用户与角色",
  "bookmarks.manage": "管理书签",
  "cards.manage": "管理卡片",
  "groups.manage": "管理分组",
  "settings.manage": "管理设置",
  "monitoring.manage": "查看与配置监控",
  "tools.manage": "使用工具",
  "backup.manage": "备份与恢复",
  "audit.viewAll": "查看全部审计日志",
  "audit.viewOwn": "查看自己的审计日志",
  "audit.purge": "清理审计日志",
  "notes.manage": "管理记事本",
  "calendar.manage": "管理日历",
  "private.write": "修改自己的私有内容",
};

const MATRIX: Record<Role, Permission[]> = {
  owner: [
    "users.manage",
    "bookmarks.manage",
    "cards.manage",
    "groups.manage",
    "settings.manage",
    "monitoring.manage",
    "tools.manage",
    "backup.manage",
    "audit.viewAll",
    "audit.viewOwn",
    "audit.purge",
    "notes.manage",
    "calendar.manage",
    "private.write",
  ],
  admin: [
    "users.manage",
    "bookmarks.manage",
    "cards.manage",
    "groups.manage",
    "settings.manage",
    "monitoring.manage",
    "tools.manage",
    "backup.manage",
    "audit.viewAll",
    "audit.viewOwn",
    "audit.purge",
    "notes.manage",
    "calendar.manage",
    "private.write",
  ],
  member: ["audit.viewOwn", "private.write"],
};

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

export function can(user: User | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  return permissionsFor(user.role).includes(perm);
}

export function isOwner(user: User | null | undefined): boolean {
  return !!user && user.role === "owner";
}

export function isAdminRole(user: User | null | undefined): boolean {
  return !!user && (user.role === "owner" || user.role === "admin");
}

/** 角色排序：owner > admin > member。用于「不能改动更高角色」判定。 */
export function roleRank(role: Role): number {
  return role === "owner" ? 3 : role === "admin" ? 2 : 1;
}

/**
 * 判断 actor 能否修改 target 这个用户。
 * - owner 不可被任何人改动/删除。
 * - admin 不能改动 owner。
 */
export function canManageUser(actor: User, target: { id: string; role: Role }): boolean {
  if (!can(actor, "users.manage")) return false;
  if (target.role === "owner") return false;
  if (target.id === actor.id) return true;
  return roleRank(actor.role) > roleRank(target.role);
}

export function canDeleteUser(actor: User, target: { id: string; role: Role }): boolean {
  if (target.role === "owner") return false; // owner 不可删除
  return canManageUser(actor, target);
}

/** 表格化权限矩阵，供管理页展示。 */
export function permissionMatrix(): { role: Role; permissions: Permission[] }[] {
  return ROLES.map((role) => ({ role, permissions: permissionsFor(role) }));
}
