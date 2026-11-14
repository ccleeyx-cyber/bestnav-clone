"use client";

import { useEffect, useMemo, useState } from "react";

export interface NavPackSummary {
  id: string;
  name: string;
  source: string;
  url: string | null;
  installed_at: string | null;
  item_count: number;
  categories: string[];
  langs: string[];
}

export interface NavPackItem {
  id: string;
  pack_id: string;
  title: string;
  url: string;
  category: string;
  lang: string;
  description: string;
}

export default function NavPackPage() {
  const [packs, setPacks] = useState<NavPackSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [items, setItems] = useState<NavPackItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [langFilter, setLangFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importUrl, setImportUrl] = useState("");

  async function loadPacks() {
    const res = await fetch("/api/navpack", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; data?: { packs: NavPackSummary[] }; error?: string };
    if (json.ok && json.data) {
      setPacks(json.data.packs);
      setActiveId((prev) => prev || json.data!.packs[0]?.id || "");
    }
  }

  useEffect(() => {
    void loadPacks();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void (async () => {
      const res = await fetch(`/api/navpack/${encodeURIComponent(activeId)}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; data?: { items: NavPackItem[] } };
      if (json.ok && json.data) {
        setItems(json.data.items);
        setSelected(new Set());
      }
    })();
  }, [activeId]);

  const activePack = useMemo(() => packs.find((p) => p.id === activeId), [packs, activeId]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))],
    [items],
  );
  const langs = useMemo(() => [...new Set(items.map((i) => i.lang).filter(Boolean))], [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (langFilter === "all" || i.lang === langFilter) &&
          (catFilter === "all" || i.category === catFilter),
      ),
    [items, langFilter, catFilter],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id))));
  }

  function invert() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of filtered) {
        if (next.has(i.id)) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  async function install() {
    if (!activeId) return;
    setError("");
    setMessage("");
    const itemIds = [...selected];
    const res = await fetch("/api/navpack/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId: activeId, itemIds }),
    });
    const json = (await res.json()) as { ok: boolean; data?: { message: string }; error?: string };
    if (!json.ok) setError(json.error ?? "导入失败");
    else {
      setMessage(json.data?.message ?? "导入完成");
      await loadPacks();
    }
  }

  async function uninstall() {
    if (!activeId) return;
    setError("");
    setMessage("");
    const res = await fetch("/api/navpack/uninstall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId: activeId }),
    });
    const json = (await res.json()) as { ok: boolean; data?: { message: string }; error?: string };
    if (!json.ok) setError(json.error ?? "卸载失败");
    else {
      setMessage(json.data?.message ?? "已卸载");
      await loadPacks();
    }
  }

  async function importPack() {
    setError("");
    setMessage("");
    const res = await fetch("/api/navpack/import-from-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: importUrl }),
    });
    const json = (await res.json()) as { ok: boolean; data?: { message: string }; error?: string };
    if (!json.ok) setError(json.error ?? "导入失败");
    else {
      setMessage(json.data?.message ?? "导入完成");
      setImportUrl("");
      await loadPacks();
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      <aside className="w-56 shrink-0">
        <h1 className="mb-2 text-sm font-semibold text-fg">导航包</h1>
        <div className="mb-4 max-h-[60vh] space-y-1 overflow-y-auto">
          {packs.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={[
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                activeId === p.id ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface hover:text-fg",
              ].join(" ")}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-2 shrink-0 rounded-full bg-surface px-1.5 text-[10px]">
                {p.item_count}
              </span>
            </button>
          ))}
          {!packs.length ? (
            <p className="px-3 text-xs text-muted">暂无导航包，请先运行种子脚本。</p>
          ) : null}
        </div>

        <div className="card p-3">
          <h2 className="mb-2 text-xs font-semibold text-fg">从 URL 导入自定义包</h2>
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://example.com/pack.json"
            className="input mb-2 w-full text-xs"
          />
          <button type="button" onClick={() => void importPack()} className="btn btn-primary w-full text-xs">
            导入
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            JSON 格式：{"{"}name, items:[{"{"}title,url,category,lang{"}"}]{"}"}
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {activePack ? (
          <>
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-base font-semibold text-fg">{activePack.name}</h2>
                <p className="text-xs text-muted">
                  {activePack.item_count} 个站点 · {activePack.source}
                  {activePack.installed_at ? " · 已安装" : ""}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  value={langFilter}
                  onChange={(e) => setLangFilter(e.target.value)}
                  className="input h-8 w-auto text-xs"
                  aria-label="语言筛选"
                >
                  <option value="all">全部语言</option>
                  {langs.map((l) => (
                    <option key={l} value={l}>
                      {l === "zh" ? "中文" : l === "en" ? "English" : l}
                    </option>
                  ))}
                </select>
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="input h-8 w-auto text-xs"
                  aria-label="分类筛选"
                >
                  <option value="all">全部分类</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={selectAll} className="btn text-xs">
                  全选
                </button>
                <button type="button" onClick={invert} className="btn text-xs">
                  反选
                </button>
                <button type="button" onClick={() => void install()} className="btn btn-primary text-xs">
                  导入选中（{selected.size}）
                </button>
                <button type="button" onClick={() => void uninstall()} className="btn text-xs">
                  卸载该包
                </button>
              </div>
            </header>

            {message ? (
              <div className="card mb-3 border-ok/40 p-2 text-xs text-ok">{message}</div>
            ) : null}
            {error ? (
              <div className="card mb-3 border-err/40 p-2 text-xs text-err">{error}</div>
            ) : null}

            <div className="overflow-hidden rounded-[14px] border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-left font-medium">标题</th>
                    <th className="px-3 py-2 text-left font-medium">分类</th>
                    <th className="w-16 px-3 py-2 text-left font-medium">语言</th>
                    <th className="px-3 py-2 text-left font-medium">地址</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-t border-border hover:bg-surface">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          aria-label={`选择 ${item.title}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-fg">{item.title}</td>
                      <td className="px-3 py-2 text-xs text-muted">{item.category}</td>
                      <td className="px-3 py-2 text-xs text-muted">{item.lang}</td>
                      <td className="px-3 py-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="truncate text-xs text-primary hover:underline"
                        >
                          {item.url}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
                        没有匹配的站点
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">请选择左侧的导航包。</p>
        )}
      </main>
    </div>
  );
}
