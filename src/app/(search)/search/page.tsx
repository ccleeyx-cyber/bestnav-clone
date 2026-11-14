"use client";

import { useCallback, useEffect, useState } from "react";
import { CategoryRail, SearchBox, SourceSection, type SearchResult } from "@/components/search/SearchWidgets";
import { CATEGORIES, type CategoryId } from "@/lib/search-categories";

export default function SearchPage() {
  const [category, setCategory] = useState<CategoryId>("web");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (cat: CategoryId, q: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&category=${cat}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { ok: boolean; data?: SearchResult; error?: string };
        if (!json.ok || !json.data) {
          setError(json.error ?? "搜索失败");
          setResult(null);
        } else {
          setResult(json.data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // 初始进入即展示各源入口（空查询）
    void run(category, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const meta = CATEGORIES.find((c) => c.id === category);

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      <aside className="hidden w-44 shrink-0 md:block">
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
          分类
        </h2>
        <CategoryRail active={category} onChange={setCategory} />
      </aside>

      <main className="min-w-0 flex-1">
        <header className="mb-4">
          <div className="mb-2 flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-fg">
              {meta?.icon} {meta?.label}搜索
            </h1>
            <span className="text-xs text-muted">{meta?.desc}</span>
          </div>
          <SearchBox
            value={query}
            onChange={setQuery}
            loading={loading}
            onSubmit={() => void run(category, query)}
          />
          <div className="mt-2 flex flex-wrap gap-1 md:hidden">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={[
                  "rounded-full px-2.5 py-1 text-xs transition",
                  category === c.id ? "bg-primary text-white" : "bg-surface text-muted",
                ].join(" ")}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="card mb-4 border-err/40 p-3 text-sm text-err">{error}</div>
        ) : null}

        {loading && !result ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-20 animate-pulse bg-surface" />
            ))}
          </div>
        ) : null}

        {result ? (
          <div>
            <p className="mb-3 text-xs text-muted">
              共 {result.results.length} 个源 · 关键词「{query || "（空）"}」
            </p>
            {result.results.map((block, i) => (
              <SourceSection key={`${block.source}-${i}`} block={block} index={i} />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

