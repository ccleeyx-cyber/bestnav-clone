"use client";

import { useState } from "react";
import type { BookmarkItem, GroupItem } from "./types";
import BookmarkCard from "./BookmarkCard";

interface Props {
  group: GroupItem;
  density: "grid" | "list" | "compact";
  query: string;
  internalMode: "auto" | "internal" | "public";
  onPublicNetwork: boolean;
  onToggleCollapse: (g: GroupItem) => void;
  onEdit: (b: BookmarkItem) => void;
  onDelete: (b: BookmarkItem) => void;
  onToggleNetwork: (b: BookmarkItem) => void;
  onCopy: (b: BookmarkItem) => void;
  onAddBookmark: (groupId: string | null) => void;
  onEditGroup: (g: GroupItem) => void;
  onDeleteGroup: (g: GroupItem) => void;
  onDragGroupStart?: (e: React.DragEvent, g: GroupItem) => void;
  onDragGroupOver?: (e: React.DragEvent) => void;
  onDropGroup?: (e: React.DragEvent, g: GroupItem) => void;
  onDragGroupEnd?: (e: React.DragEvent) => void;
  onDragBookmarkStart?: (e: React.DragEvent, b: BookmarkItem) => void;
  onDropBookmark?: (e: React.DragEvent, b: BookmarkItem) => void;
}

export default function BookmarkGroup({
  group: g,
  density,
  query,
  internalMode,
  onPublicNetwork,
  onToggleCollapse,
  onEdit,
  onDelete,
  onToggleNetwork,
  onCopy,
  onAddBookmark,
  onEditGroup,
  onDeleteGroup,
  onDragGroupStart,
  onDragGroupOver,
  onDropGroup,
  onDragGroupEnd,
  onDragBookmarkStart,
  onDropBookmark,
}: Props) {
  const [over, setOver] = useState(false);
  const collapsed = !!g.collapsed;

  function resolve(b: BookmarkItem): string {
    if (!b.internal_url) return b.url;
    if (internalMode === "internal") return b.internal_url;
    if (internalMode === "public") return b.url;
    if (onPublicNetwork) {
      return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(b.internal_url)
        ? b.url
        : b.internal_url;
    }
    return b.internal_url;
  }

  const gridCols =
    density === "compact"
      ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
      : density === "list"
        ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <section
      className={`mb-8 ${over ? "rounded-xl bg-primary/5 outline outline-2 outline-primary/40" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (onDragGroupOver) onDragGroupOver(e);
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDropGroup?.(e, g);
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          className="flex items-center gap-2 text-left text-base font-semibold"
          onClick={() => onToggleCollapse(g)}
          title="折叠 / 展开"
        >
          <span className="text-xs text-muted">{collapsed ? "▸" : "▾"}</span>
          {g.icon && <span>{g.icon}</span>}
          <span>{g.name}</span>
          <span className="text-xs font-normal text-muted">{g.bookmarks.length}</span>
        </button>
        {g.visibility === "private" && <span className="chip text-[10px] text-warn">私有</span>}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn text-xs" onClick={() => onAddBookmark(g.id === "__ungrouped__" ? null : g.id)}>
            + 书签
          </button>
          {g.id !== "__ungrouped__" && (
            <>
              <button className="btn text-xs" onClick={() => onEditGroup(g)}>
                编辑
              </button>
              <button className="btn text-xs text-err" onClick={() => onDeleteGroup(g)}>
                删除
              </button>
            </>
          )}
          <span
            draggable
            onDragStart={(e) => onDragGroupStart?.(e, g)}
            onDragEnd={(e) => onDragGroupEnd?.(e)}
            className="chip cursor-grab select-none"
            title="拖拽排序分组"
          >
            ⠿
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className={`grid gap-3 ${gridCols}`}>
          {g.bookmarks.map((b) => (
            <div
              key={b.id}
              data-drag-id={b.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                onDropBookmark?.(e, b);
              }}
            >
              <BookmarkCard
                bookmark={b}
                density={density}
                target={resolve(b)}
                targetIsInternal={!!b.internal_url && resolve(b) === b.internal_url}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleNetwork={onToggleNetwork}
                onCopy={onCopy}
                draggable
                onDragStart={(e) => onDragBookmarkStart?.(e, b)}
                onDragEnd={() => onDragBookmarkStart?.(undefined as never, b)}
              />
            </div>
          ))}
          {g.bookmarks.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted">这一组还是空的</p>
          )}
        </div>
      )}
    </section>
  );
}
