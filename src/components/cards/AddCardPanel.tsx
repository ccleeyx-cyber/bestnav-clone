"use client";

import { useState } from "react";
import type { CardItem } from "../bookmarks/types";
import { CARD_KINDS, defaultConfig, defaultPosition } from "./CardWallItem";

interface Props {
  open: boolean;
  cards: CardItem[];
  onClose: () => void;
  onCreate: (kind: string, title: string) => void;
  onEdit: (c: CardItem) => void;
  onDelete: (c: CardItem) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

export default function AddCardPanel({
  open,
  cards,
  onClose,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const [kind, setKind] = useState<string>("clock");
  const [title, setTitle] = useState("");

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[340px] max-w-[92vw] flex-col border-l border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">卡片墙</h2>
        <button className="btn text-xs" onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="border-b border-border px-4 py-3">
        <label className="mb-1 block text-xs text-muted">卡片类型</label>
        <div className="grid grid-cols-2 gap-1.5">
          {CARD_KINDS.map((k) => (
            <button
              key={k.kind}
              className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                kind === k.kind
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setKind(k.kind)}
              title={k.hint}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="mb-1 mt-3 block text-xs text-muted">标题（可选）</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="卡片标题"
        />
        <button
          className="btn btn-primary mt-3 w-full justify-center"
          onClick={() => {
            onCreate(kind, title.trim());
            setTitle("");
          }}
        >
          添加卡片
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-2 text-xs text-muted">已添加 {cards.length} 张卡片</p>
        <div className="space-y-1.5">
          {cards.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm">
                  {c.title || CARD_KINDS.find((k) => k.kind === c.kind)?.label || c.kind}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    className="chip px-1.5 py-0 text-[10px]"
                    onClick={() => onMove(c.id, -1)}
                    disabled={i === 0}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    className="chip px-1.5 py-0 text-[10px]"
                    onClick={() => onMove(c.id, 1)}
                    disabled={i === cards.length - 1}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    className="chip px-1.5 py-0 text-[10px] hover:text-primary"
                    onClick={() => onEdit(c)}
                  >
                    ✎
                  </button>
                  <button
                    className="chip px-1.5 py-0 text-[10px] hover:text-err"
                    onClick={() => onDelete(c)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {c.kind} · 位置 {c.position?.x ?? 0},{c.position?.y ?? 0}
              </div>
            </div>
          ))}
          {cards.length === 0 && (
            <p className="py-6 text-center text-xs text-muted">还没有卡片</p>
          )}
        </div>
      </div>
    </aside>
  );
}

export { defaultConfig, defaultPosition };
