import Link from "next/link";
import type { ReactNode } from "react";

export const ADMIN_NAV = [
  { href: "/users", label: "用户与角色" },
  { href: "/audit", label: "审计日志" },
  { href: "/backup", label: "备份恢复" },
  { href: "/visitors", label: "访客统计" },
  { href: "/notes", label: "记事本" },
  { href: "/calendar", label: "日历" },
];

/**
 * 管理后台外壳：左侧固定导航 + 右侧内容区。
 * 不改动 src/components/shell（那是主页的外壳，bookmarks 队友负责）。
 */
export default function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] gap-6 px-4 py-6 lg:px-8">
      <aside className="hidden w-48 shrink-0 lg:block">
        <div className="sticky top-6">
          <Link href="/" className="mb-4 block text-sm font-semibold text-muted hover:text-primary">
            ← 返回首页
          </Link>
          <nav className="card flex flex-col gap-1 p-2">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-fg transition hover:bg-bg hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="mb-5">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </header>
        <div className="lg:hidden mb-4 flex flex-wrap gap-2">
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="chip">
              {item.label}
            </Link>
          ))}
        </div>
        {children}
      </main>
    </div>
  );
}
