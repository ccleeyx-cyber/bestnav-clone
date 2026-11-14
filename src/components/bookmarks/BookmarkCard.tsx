"use client";

import { useEffect, useRef, useState } from "react";
import type { BookmarkItem } from "./types";
import { faviconUrl, initialOf, letterColor } from "./types";

interface Props {
  bookmark: BookmarkItem;
  target: string;
  targetIsInternal: boolean;
  onEdit: (b: BookmarkItem) => void;
  onDelete: (b: BookmarkItem) => void;
  onToggleNetwork: (b: BookmarkItem) => void;
  onCopy: (b: BookmarkItem) => void;
  density: "grid" | "list" | "compact";
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export default function BookmarkCard({
  bookmark: b,
  target,
  targetIsInternal,
  onEdit,
  onDelete,
  onToggleNetwork,
  onCopy,
  density,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const compact = density === "compact";
  const list = density === "list";

  return (
    <div
      className="group relative"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >      <a
        href={target}
        target="_blank"
        rel="noreferrer noopener"
        title={b.url}
        className={[
          "card flex transition hover:border-primary/60 hover:shadow-card",
          list
            ? "flex-row items-center gap-3 px-3 py-2"
            : compact
              ? "flex-row items-center gap-2 px-2.5 py-2"
              : "flex-col items-start gap-2 p-4",
        ].join(" ")}
      >
        <span
          className={[
            "grid shrink-0 place-items-center overflow-hidden rounded-xl text-white",
            list || compact ? "h-7 w-7" : "h-10 w-10",
          ].join(" ")}
          style={{ background: b.icon_color || letterColor(b.url) }}
        >
          {b.icon ? (
            <img
              src={b.icon}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : imgOk ? (
            <img
              src={faviconUrl(b.url)}
              alt=""
              className="h-full w-full bg-white/90 object-contain p-0.5"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="text-xs font-semibold">{initialOf(b.title)}</span>
          )}
        </span>

        <span className={list || compact ? "min-w-0 flex-1" : "w-full"}>
          <span className="flex items-center gap-1">
            <span className="block truncate text-sm font-medium">{b.title}</span>
            {targetIsInternal && (
              <span className="chip shrink-0 px-1 py-0 text-[10px] text-accent">内网</span>
            )}
            {b.visibility === "private" && (
              <span className="chip shrink-0 px-1 py-0 text-[10px] text-warn">私有</span>
            )}
          </span>
          {!compact && b.description && (
            <span className="mt-0.5 block truncate text-xs text-muted">{b.description}</span>
          )}
        </span>
      </a>

      {/* 悬停/右键菜单 */}
      <div className="absolute right-1.5 top-1.5 z-20">
        <button
          className="hidden h-6 w-6 place-items-center rounded-lg border border-border bg-surface text-xs text-muted transition hover:text-primary group-hover:grid"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
          aria-label="更多"
        >
          ⋯
        </button>
      </div>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-1.5 top-1.5 z-30 w-40 rounded-xl border border-border bg-surface p-1 shadow-card"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              onEdit(b);
            }}
          >
            编辑
          </button>
          <button
            className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              onCopy(b);
            }}
          >
            复制链接
          </button>
          {b.internal_url && (
            <button
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onToggleNetwork(b);
              }}
            >
              切换内网 / 公网
            </button>
          )}
          <button
            className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-err hover:bg-bg"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              onDelete(b);
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
