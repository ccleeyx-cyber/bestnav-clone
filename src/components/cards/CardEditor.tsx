"use client";

import { useState } from "react";
import type { CardItem } from "../bookmarks/types";
import { CARD_KINDS, defaultConfig } from "./CardWallItem";

export interface CardDraft {
  id?: string;
  kind: string;
  title: string;
  config: Record<string, unknown>;
  position: { x?: number; y?: number; w?: number; h?: number };
  visibility: "public" | "private";
}

export function cardDraftFrom(c: CardItem): CardDraft {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    config: { ...c.config },
    position: { ...c.position },
    visibility: c.visibility,
  };
}

interface Props {
  draft: CardDraft;
  onChange: (d: CardDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}

export default function CardEditor({ draft, onChange, onSubmit, onCancel, busy, error }: Props) {
  const [cfgText, setCfgText] = useState(() => JSON.stringify(draft.config ?? {}, null, 2));
  const set = <K extends keyof CardDraft>(k: K, v: CardDraft[K]) => onChange({ ...draft, [k]: v });

  function applyConfig() {
    try {
      const parsed = JSON.parse(cfgText);
      onChange({ ...draft, config: parsed });
    } catch {
      /* 保留原值 */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10 backdrop-blur-sm">
      <div className="card w-full max-w-[560px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">编辑卡片</h2>
          <button className="btn text-xs" onClick={onCancel}>
            关闭
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">类型</label>
            <select
              className="input"
              value={draft.kind}
              onChange={(e) => {
                const k = e.target.value;
                onChange({ ...draft, kind: k, config: defaultConfig(k) });
                setCfgText(JSON.stringify(defaultConfig(k), null, 2));
              }}
            >
              {CARD_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">标题</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">配置（JSON）</label>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              value={cfgText}
              onChange={(e) => setCfgText(e.target.value)}
              onBlur={applyConfig}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <div key={k}>
                <label className="mb-1 block text-xs text-muted">{k}</label>
                <input
                  className="input"
                  type="number"
                  value={String(draft.position[k] ?? 0)}
                  onChange={(e) =>
                    set("position", { ...draft.position, [k]: Number(e.target.value) || 0 })
                  }
                />
              </div>
            ))}
          </div>

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
