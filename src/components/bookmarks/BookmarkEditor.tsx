"use client";

import { useEffect, useState } from "react";
import type { BookmarkItem } from "./types";
import { faviconUrl, initialOf, letterColor } from "./types";

export interface BookmarkDraft {
  id?: string;
  group_id: string | null;
  title: string;
  url: string;
  internal_url: string;
  description: string;
  icon: string;
  icon_color: string;
  tags: string;
  visibility: "public" | "private";
  sort_order: number;
}

export function emptyDraft(groupId: string | null): BookmarkDraft {
  return {
    group_id: groupId,
    title: "",
    url: "",
    internal_url: "",
    description: "",
    icon: "",
    icon_color: "",
    tags: "",
    visibility: "public",
    sort_order: 0,
  };
}

export function draftFrom(b: BookmarkItem): BookmarkDraft {
  return {
    id: b.id,
    group_id: b.group_id,
    title: b.title,
    url: b.url,
    internal_url: b.internal_url ?? "",
    description: b.description,
    icon: b.icon,
    icon_color: b.icon_color,
    tags: b.tags.join(", "),
    visibility: b.visibility,
    sort_order: b.sort_order,
  };
}

interface Props {
  draft: BookmarkDraft;
  groups: { id: string; name: string }[];
  onChange: (d: BookmarkDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}

export default function BookmarkEditor({
  draft,
  groups,
  onChange,
  onSubmit,
  onCancel,
  busy,
  error,
}: Props) {
  const [imgOk, setImgOk] = useState(true);
  const set = <K extends keyof BookmarkDraft>(k: K, v: BookmarkDraft[K]) =>
    onChange({ ...draft, [k]: v });

  useEffect(() => setImgOk(true), [draft.url]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10 backdrop-blur-sm">
      <div className="card w-full max-w-[560px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {draft.id ? "编辑书签" : "新建书签"}
          </h2>
          <button className="btn text-xs" onClick={onCancel}>
            关闭
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-white"
              style={{ background: draft.icon_color || letterColor(draft.url || draft.title) }}
            >
              {draft.icon ? (
                <img src={draft.icon} alt="" className="h-full w-full object-cover" />
              ) : imgOk && draft.url ? (
                <img
                  src={faviconUrl(draft.url)}
                  alt=""
                  className="h-full w-full bg-white/90 object-contain p-0.5"
                  onError={() => setImgOk(false)}
                />
              ) : (
                <span className="text-xs font-semibold">{initialOf(draft.title)}</span>
              )}
            </span>
            <input
              className="input"
              placeholder="标题"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">网址</label>
            <input
              className="input"
              placeholder="https://example.com"
              value={draft.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">内网地址（可选）</label>
            <input
              className="input"
              placeholder="http://192.168.1.10:8080"
              value={draft.internal_url}
              onChange={(e) => set("internal_url", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">描述</label>
            <input
              className="input"
              placeholder="一句话说明这个站是干什么的"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">标签（逗号分隔）</label>
              <input
                className="input"
                placeholder="dev, 常用"
                value={draft.tags}
                onChange={(e) => set("tags", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">分组</label>
              <select
                className="input"
                value={draft.group_id ?? ""}
                onChange={(e) => set("group_id", e.target.value || null)}
              >
                <option value="">未分组</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">可见性</label>
              <select
                className="input"
                value={draft.visibility}
                onChange={(e) => set("visibility", e.target.value as "public" | "private")}
              >
                <option value="public">公开</option>
                <option value="private">私有</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">自定义图标 URL（可选）</label>
              <input
                className="input"
                placeholder="留空自动用 favicon"
                value={draft.icon}
                onChange={(e) => set("icon", e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn" onClick={onCancel} disabled={busy}>
              取消
            </button>
            <button className="btn btn-primary" onClick={onSubmit} disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
