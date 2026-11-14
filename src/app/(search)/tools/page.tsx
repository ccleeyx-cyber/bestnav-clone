"use client";

import { useEffect, useMemo, useState } from "react";
import { EngineForm, renderOutput, type ToolEngineMeta, type ToolRunOutput } from "@/components/tools/ToolWidgets";

interface CategoryMeta {
  id: string;
  label: string;
  icon: string;
}

export default function ToolsPage() {
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [engines, setEngines] = useState<ToolEngineMeta[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("pdf");
  const [activeEngine, setActiveEngine] = useState<string>("");
  const [result, setResult] = useState<ToolRunOutput | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/tools", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { categories: CategoryMeta[]; engines: ToolEngineMeta[] };
      };
      if (json.ok && json.data) {
        setCategories(json.data.categories);
        setEngines(json.data.engines);
        if (!activeEngine) setActiveEngine(json.data.engines[0]?.name ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, ToolEngineMeta[]> = {};
    for (const e of engines) {
      if (!map[e.category]) map[e.category] = [];
      map[e.category]!.push(e);
    }
    return map;
  }, [engines]);

  const visible = grouped[activeCategory] ?? [];
  const current = visible.find((e) => e.name === activeEngine) ?? visible[0];

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      <aside className="w-44 shrink-0">
        <h1 className="mb-2 text-sm font-semibold text-fg">工具箱</h1>
        <nav className="space-y-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveCategory(c.id);
                const first = grouped[c.id]?.[0];
                if (first) setActiveEngine(first.name);
                setResult(null);
                setError("");
              }}
              className={[
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                activeCategory === c.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:bg-surface hover:text-fg",
              ].join(" ")}
            >
              <span>
                {c.icon} {c.label}
              </span>
              <span className="rounded-full bg-surface px-1.5 text-[10px]">
                {grouped[c.id]?.length ?? 0}
              </span>
            </button>
          ))}
        </nav>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          共 {engines.length} 个引擎。部分能力依赖系统命令（tesseract / pdftoppm），未安装时会明确提示。
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-3">
            {visible.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => {
                  setActiveEngine(e.name);
                  setResult(null);
                  setError("");
                }}
                className={[
                  "card w-full p-3 text-left transition",
                  current?.name === e.name ? "border-primary/50" : "hover:shadow-sm",
                ].join(" ")}
              >
                <div className="text-sm font-medium text-fg">{e.name}</div>
                <div className="mt-0.5 text-xs text-muted">{e.description}</div>
              </button>
            ))}
            {!visible.length ? (
              <p className="text-xs text-muted">该模块暂无引擎。</p>
            ) : null}
          </div>

          <div className="space-y-3">
            {current ? (
              <EngineForm
                key={current.name}
                engine={current}
                onResult={setResult}
                onError={setError}
              />
            ) : null}
            {error ? (
              <div className="card border-err/40 p-3 text-sm text-err">{error}</div>
            ) : null}
            {result ? renderOutput(result) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
