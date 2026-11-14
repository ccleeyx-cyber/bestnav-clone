"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardItem } from "../bookmarks/types";

export const CARD_KINDS = [
  { kind: "clock", label: "时钟", hint: "显示当前日期与时间" },
  { kind: "weather", label: "天气", hint: "天气占位卡片" },
  { kind: "search", label: "搜索", hint: "选择搜索源" },
  { kind: "note", label: "记事本", hint: "随手记录" },
  { kind: "quote", label: "每日一句", hint: "一句话" },
  { kind: "stock", label: "自选股", hint: "自选股占位" },
  { kind: "custom", label: "自定义链接", hint: "自定义跳转链接" },
] as const;

export type CardKindId = (typeof CARD_KINDS)[number]["kind"];

export function defaultConfig(kind: string): Record<string, unknown> {
  switch (kind) {
    case "clock":
      return { format: "HH:mm", showDate: true, showSeconds: false };
    case "weather":
      return { city: "北京", placeholder: true };
    case "search":
      return { source: "Google", url: "https://www.google.com/search?q={q}" };
    case "note":
      return { body: "在这里写点什么…" };
    case "quote":
      return { text: "路漫漫其修远兮，吾将上下而求索。", author: "屈原" };
    case "stock":
      return { symbols: ["AAPL", "MSFT"], placeholder: true };
    case "custom":
      return { url: "https://example.com", label: "自定义" };
    default:
      return {};
  }
}

export function defaultPosition(index: number): { x: number; y: number; w: number; h: number } {
  return { x: index % 4, y: Math.floor(index / 4), w: 1, h: 1 };
}

function CardBody({ card }: { card: CardItem }) {
  const cfg = card.config ?? {};

  switch (card.kind) {
    case "clock": {
      const fmt = String(cfg.format ?? "HH:mm");
      const showDate = cfg.showDate !== false;
      const showSeconds = cfg.showSeconds === true;
      return <ClockCard format={fmt} showDate={showDate} showSeconds={showSeconds} />;
    }
    case "weather":
      return (
        <div className="text-center">
          <div className="text-2xl">🌤</div>
          <div className="mt-1 text-sm font-medium">{String(cfg.city ?? "未设置城市")}</div>
          <div className="text-xs text-muted">天气组件待接入</div>
        </div>
      );
    case "search":
      return (
        <div className="text-center">
          <div className="text-lg">⌕</div>
          <div className="mt-1 text-sm font-medium">{String(cfg.source ?? "Google")}</div>
          <div className="text-xs text-muted">点击下方输入框搜索</div>
          <MiniSearch url={String(cfg.url ?? "https://www.google.com/search?q={q}")} />
        </div>
      );
    case "note":
      return <NoteCard card={card} />;
    case "quote":
      return (
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm leading-relaxed">{String(cfg.text ?? "每日一句")}</p>
          {cfg.author ? (
            <p className="mt-2 text-right text-xs text-muted">— {String(cfg.author)}</p>
          ) : null}
        </div>
      );
    case "stock":
      return (
        <div className="text-center">
          <div className="text-lg">📈</div>
          <div className="mt-1 text-sm">{Array.isArray(cfg.symbols) ? cfg.symbols.join(" · ") : "自选股"}</div>
          <div className="text-xs text-muted">行情数据待接入</div>
        </div>
      );
    case "custom":
      return (
        <a
          href={String(cfg.url ?? "#")}
          target="_blank"
          rel="noreferrer noopener"
          className="flex h-full flex-col items-center justify-center gap-1"
        >
          <span className="text-lg">🔗</span>
          <span className="text-sm font-medium">{String(cfg.label ?? "自定义链接")}</span>
        </a>
      );
    default:
      return <div className="text-center text-sm text-muted">未知卡片类型</div>;
  }
}

function ClockCard({
  format,
  showDate,
  showSeconds,
}: {
  format: string;
  showDate: boolean;
  showSeconds: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="text-center text-sm text-muted">--:--</div>;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  let time = `${hh}:${mm}`;
  if (showSeconds) time += `:${ss}`;
  if (format.includes("MM") || format.includes("DD") || format.includes("YYYY")) {
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    time = format
      .replace("HH", hh)
      .replace("mm", mm)
      .replace("ss", ss)
      .replace("YYYY", String(y))
      .replace("MM", mo)
      .replace("DD", d);
  }
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold tabular-nums">{time}</div>
      {showDate && (
        <div className="text-xs text-muted">
          {now.getFullYear()}-{String(now.getMonth() + 1).padStart(2, "0")}-
          {String(now.getDate()).padStart(2, "0")}
        </div>
      )}
    </div>
  );
}

function MiniSearch({ url }: { url: string }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        window.open(url.replace("{q}", encodeURIComponent(q.trim())), "_blank", "noreferrer");
      }}
    >
      <input
        className="input text-xs"
        placeholder="搜索…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

function NoteCard({ card }: { card: CardItem }) {
  const body = String(card.config?.body ?? "");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  useEffect(() => setText(body), [body]);

  return (
    <div className="flex h-full flex-col">
      {editing ? (
        <>
          <textarea
            className="input min-h-[70px] flex-1 resize-none text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-primary mt-1 justify-center text-xs"
            onClick={() => {
              setEditing(false);
              void fetch("/api/cards", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: card.id, config: { ...card.config, body: text } }),
              });
            }}
          >
            保存
          </button>
        </>
      ) : (
        <button
          className="flex-1 cursor-text whitespace-pre-wrap text-left text-xs text-fg"
          onClick={() => setEditing(true)}
        >
          {body || "点击写点什么…"}
        </button>
      )}
    </div>
  );
}

interface Props {
  card: CardItem;
  onEdit: (c: CardItem) => void;
  onDelete: (c: CardItem) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export default function CardWallItem({
  card,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const kindLabel = useMemo(
    () => CARD_KINDS.find((k) => k.kind === card.kind)?.label ?? card.kind,
    [card.kind],
  );
  return (
    <div
      className="group relative"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="card flex h-full min-h-[120px] flex-col p-3">
        <div className="mb-1 flex items-center gap-1">
          <span className="truncate text-xs font-medium text-muted">
            {card.title || kindLabel}
          </span>
          <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              className="chip px-1.5 py-0 text-[10px] hover:text-primary"
              onClick={() => onEdit(card)}
              title="编辑"
            >
              ✎
            </button>
            <button
              className="chip px-1.5 py-0 text-[10px] hover:text-err"
              onClick={() => onDelete(card)}
              title="删除"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1">
          <CardBody card={card} />
        </div>
      </div>
    </div>
  );
}
