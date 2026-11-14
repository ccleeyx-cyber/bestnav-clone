"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const SOURCES = [
  { name: "Google", tpl: "https://www.google.com/search?q={q}" },
  { name: "Bing", tpl: "https://www.bing.com/search?q={q}" },
  { name: "百度", tpl: "https://www.baidu.com/s?wd={q}" },
  { name: "GitHub", tpl: "https://github.com/search?q={q}" },
  { name: "DuckDuckGo", tpl: "https://duckduckgo.com/?q={q}" },
];

export default function GlobalSearch({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(0);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const tpl = SOURCES[source]?.tpl ?? SOURCES[0].tpl;
    window.open(tpl.replace("{q}", encodeURIComponent(q)), "_blank", "noreferrer");
  }

  return (
    <form ref={ref} onSubmit={submit} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            ⌕
          </span>
          <input
            className="input pl-9"
            value={value}
            placeholder={placeholder ?? "搜索书签（支持拼音 / 模糊匹配标题、标签、描述）"}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            aria-label="全局搜索"
          />
        </div>
        <div className="hidden sm:block">
          <select
            className="input w-32"
            value={source}
            onChange={(e) => setSource(Number(e.target.value))}
            aria-label="搜索源"
          >
            {SOURCES.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {open && value.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border bg-surface p-1 shadow-card">
          <button
            className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const tpl = SOURCES[source].tpl;
              window.open(tpl.replace("{q}", encodeURIComponent(value.trim())), "_blank", "noreferrer");
            }}
          >
            在 {SOURCES[source].name} 中搜索「{value.trim()}」
          </button>
        </div>
      )}
    </form>
  );
}
