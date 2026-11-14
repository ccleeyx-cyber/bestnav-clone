import type { MagazineData } from "./types";

/**
 * 杂志流模板：大图头条 + CSS Grid 杂志式分栏。
 * 视觉明显区别于经典卡片模板：衬线大标题、栏线分隔、栏宽不等。
 */
export default function MagazineTemplate({ data }: { data: MagazineData }) {
  const { headline, columns, sidebar } = data;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-8 lg:px-10">
      <header className="mb-8 flex items-end justify-between border-b-2 border-fg pb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted">BestNav · Journal</div>
          <h1 className="font-serif text-3xl font-bold tracking-tight lg:text-4xl">今日导航</h1>
        </div>
        {data.updatedAt ? (
          <div className="text-xs text-muted">更新于 {data.updatedAt}</div>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main className="min-w-0">
          {/* 头条 */}
          <section className="mb-10">
            <div className="grid items-stretch gap-0 overflow-hidden rounded-[14px] border border-border md:grid-cols-[1.15fr_1fr]">
              <div
                className="relative min-h-[220px] bg-gradient-to-br from-primary/25 via-accent/15 to-transparent"
                style={
                  headline.cover
                    ? { backgroundImage: `url(${headline.cover})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              />
              <div className="flex flex-col justify-center gap-3 bg-surface p-6 lg:p-8">
                <span className="w-fit rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-white">
                  {headline.tag ?? "头条"}
                </span>
                <h2 className="font-serif text-2xl font-bold leading-snug lg:text-[28px]">
                  {headline.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted">{headline.summary}</p>
                {headline.link ? (
                  <a
                    href={headline.link}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit border-b-2 border-primary pb-0.5 text-sm font-medium text-primary transition hover:opacity-70"
                  >
                    阅读全文 →
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          {/* 杂志分栏：不等宽的 CSS Grid */}
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((col, idx) => (
              <section
                key={col.id}
                className={
                  idx === 0
                    ? "sm:col-span-2 lg:col-span-2 lg:pr-6 lg:border-r lg:border-border"
                    : "lg:border-r lg:border-border lg:pr-6"
                }
              >
                <h3 className="mb-4 flex items-baseline gap-2 border-b border-border pb-2 font-serif text-lg font-bold">
                  {col.icon ? <span aria-hidden>{col.icon}</span> : null}
                  {col.name}
                  <span className="ml-auto text-xs font-normal text-muted">
                    {col.bookmarks.length}
                  </span>
                </h3>
                {col.bookmarks.length === 0 ? (
                  <p className="text-sm text-muted">这一栏还是空的。</p>
                ) : (
                  <ul className="space-y-4">
                    {col.bookmarks.map((b) => (
                      <li key={b.id}>
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group block"
                        >
                          <div className="font-serif text-base font-semibold leading-snug group-hover:text-primary">
                            {b.title}
                          </div>
                          {b.description ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                              {b.description}
                            </p>
                          ) : null}
                          <div className="mt-1 text-[11px] text-muted/80">{b.url}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            {columns.length === 0 ? (
              <p className="text-sm text-muted">还没有可展示的栏目（公开书签为空）。</p>
            ) : null}
          </div>
        </main>

        {/* 侧栏 */}
        <aside className="lg:border-l lg:border-border lg:pl-6">
          <h3 className="mb-4 border-b border-border pb-2 text-xs uppercase tracking-[0.2em] text-muted">
            边栏
          </h3>
          {sidebar.length === 0 ? (
            <p className="text-sm text-muted">暂无内容</p>
          ) : (
            <ul className="space-y-3">
              {sidebar.map((b) => (
                <li key={b.id}>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm transition hover:text-primary"
                  >
                    {b.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
