# BestNav Clone · 团队契约

项目根：`E:\workspace\个人\projects\bestnav-clone`
技术栈：Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + node:sqlite（内置，无需编译原生模块）

## 已就绪的地基（**不要修改**，直接用）

| 文件 | 用途 |
|---|---|
| `src/lib/db.ts` | `db()` 连接、`rows()`、`one()`、`run()`、`now()`、`uid()`、`setting()`、`setSetting()`、`getJSON()`/`setJSON()` |
| `src/lib/schema.sql` | 全部表结构（含你负责的模块的表） |
| `src/lib/auth.ts` | `currentUser` 用户体系、`hashPassword`/`verifyPassword`、`audit()` 审计、`issueToken`/`verifyToken`、`isAdmin` |
| `src/lib/session.ts` | `currentUser()`、`isAdmin()` |
| `src/lib/api.ts` | `ok()`、`fail()`、`requireUser()`、`requireAdmin()`、`isResponse()` |
| `src/lib/types.ts` | 共享 TS 类型 |
| `src/app/globals.css` | Tailwind + CSS 变量主题（`bg/surface/fg/muted/primary/ok/warn/err`），暗色 `.dark` class |
| `src/app/layout.tsx` | 根布局 |

## 硬性规则

1. **只改自己负责的目录**。公共文件（`src/lib/*`、`src/app/layout.tsx`、`src/app/globals.css`、`src/app/api/auth/*`、`package.json`、`schema.sql`）**只有 lead 能改**。需要新增表 → 在你的任务里说明，由 lead 改 `schema.sql`。
2. 所有 DB 读写走 `@/lib/db` 的 `rows/one/run`，**不要自己 new DatabaseSync**。
3. API 路由统一用 `@/lib/api` 的 `ok/fail`，返回 `{ok:true,data}` / `{ok:false,error}`。
4. 路径别名 `@/*` → `src/*` 已配好。
5. 数据库文件在 `data/bestnav.db`（`BESTNAV_DATA_DIR` 可覆盖），**不要提交 data/ 目录**。
6. 不新增重量依赖。需要时只用已在 `package.json` 里的包；确需新增 → 在任务说明里列出，不要自行 `pnpm add`（避免 lockfile 冲突）。

## 视觉规范

- 用 CSS 变量类名：`bg-surface`、`text-fg`、`text-muted`、`border-border`、`bg-primary`、`text-ok` 等（Tailwind 已在 config 里映射）
- 卡片用 `.card` 类；按钮 `.btn` / `.btn-primary`；输入框 `.input`
- 圆角统一 `rounded-lg` / `rounded-xl`，卡片 `rounded-[14px]`
- 间距用 Tailwind 原子类，不要写死 px
- 动画用 CSS transition，不要引动画库

## 验收

- `pnpm typecheck` 必须通过（`tsc --noEmit`）
- 你负责的页面能被 `pnpm dev` 打开且不报运行时报错
- 不要留下 `TODO` 或 `throw new Error("not implemented")`
