"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/search-categories";

export interface SearchItem {
  title: string;
  url: string;
  desc: string;
  image?: string;
}

export interface SourceBlock {
  source: string;
  items: SearchItem[];
  error?: string;
}

export interface SearchResult {
  category: string;
  results: SourceBlock[];
}

export function CategoryRail({
  active,
  onChange,
}: {
  active: CategoryId;
  onChange: (c: CategoryId) => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          title={c.desc}
          className={[
            "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
            active === c.id
              ? "bg-primary/15 text-primary font-medium"
              : "text-muted hover:bg-surface hover:text-fg",
          ].join(" ")}
        >
          <span className="text-base leading-none">{c.icon}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="输入关键词，跨 12 个分类直达搜索…"
        className="input h-12 w-full pr-24 text-base"
        aria-label="搜索关键词"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted sm:inline">
          ⌘K
        </kbd>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="btn btn-primary h-9 px-4 text-sm"
        >
          {loading ? "搜索中…" : "搜索"}
        </button>
      </div>
    </div>
  );
}

export function ResultCard({ item }: { item: SearchItem }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card group flex gap-3 p-3 transition hover:shadow-sm">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-sm font-medium text-fg hover:text-primary"
          title={item.url}
        >
          {item.title}
        </a>
        {item.desc ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{item.desc}</p>
        ) : null}
        <div className="mt-1.5 flex gap-2 text-[11px] text-muted opacity-0 transition group-hover:opacity-100">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded px-1.5 py-0.5 hover:bg-surface hover:text-primary"
          >
            打开
          </a>
          <button
            type="button"
            onClick={copy}
            className="rounded px-1.5 py-0.5 hover:bg-surface hover:text-primary"
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourceSection({
  block,
  index,
}: {
  block: SourceBlock;
  index: number;
}) {
  return (
    <section className="mb-6">
      <header className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">{block.source}</h3>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
          {block.items.length}
        </span>
        {block.error ? (
          <span className="text-[11px] text-warn" title={block.error}>
            请求失败，已降级为直达链接
          </span>
        ) : null}
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.items.map((item, i) => (
          <ResultCard key={`${block.source}-${i}`} item={item} />
        ))}
      </div>
      {index === 0 ? null : null}
    </section>
  );
}

