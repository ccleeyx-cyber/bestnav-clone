"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shell/TopBar";
import { useShell } from "@/components/shell/ShellProvider";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/components/shell/api";
import GlobalSearch from "@/components/bookmarks/GlobalSearch";
import BookmarkGroup from "@/components/bookmarks/BookmarkGroup";
import BookmarkEditor, {
  draftFrom,
  emptyDraft,
  type BookmarkDraft,
} from "@/components/bookmarks/BookmarkEditor";
import AddCardPanel, { defaultConfig, defaultPosition } from "@/components/cards/AddCardPanel";
import CardEditor, { cardDraftFrom, type CardDraft } from "@/components/cards/CardEditor";
import CardWallItem from "@/components/cards/CardWallItem";
import type { BookmarkItem, CardItem, GroupItem } from "@/components/bookmarks/types";
import { isPublicNetwork, matchBookmark } from "@/components/bookmarks/types";

type DragState =
  | { kind: "group"; id: string }
  | { kind: "bookmark"; id: string; groupId: string | null }
  | { kind: "card"; id: string }
  | null;

export default function HomePage() {
  const shell = useShell();
  const router = useRouter();

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState<BookmarkDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [cardDraftState, setCardDraftState] = useState<CardDraft | null>(null);
  const [cardError, setCardError] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  dragRef.current = drag;

  const internalMode = (shell.settings.internalMode as "auto" | "internal" | "public") || "auto";
  const onPublicNetwork = useMemo(
    () => (typeof window === "undefined" ? true : isPublicNetwork(window.location.hostname)),
    [],
  );

  const load = useCallback(async () => {
    try {
      const g = await apiGet<GroupItem[]>("/api/bookmarks");
      const c = await apiGet<CardItem[]>("/api/cards");
      setGroups(g ?? []);
      setCards(c ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 首次访问且没有任何用户 → /setup
  useEffect(() => {
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.data?.needsSetup) router.replace("/setup");
      })
      .catch(() => {});
  }, [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    return groups
      .map((g) => ({ ...g, bookmarks: g.bookmarks.filter((b) => matchBookmark(b, query)) }))
      .filter((g) => g.bookmarks.length > 0 || g.name.toLowerCase().includes(query.toLowerCase()));
  }, [groups, query]);

  // ---------- 书签操作 ----------
  async function saveBookmark() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.url.trim()) {
      setFormError("标题和网址不能为空");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        group_id: draft.group_id,
        title: draft.title.trim(),
        url: draft.url.trim(),
        internal_url: draft.internal_url.trim() || null,
        description: draft.description.trim(),
        icon: draft.icon.trim(),
        icon_color: draft.icon_color.trim(),
        tags: draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        visibility: draft.visibility,
        sort_order: draft.sort_order,
      };
      if (draft.id) await apiPatch("/api/bookmarks", { id: draft.id, ...payload });
      else await apiPost("/api/bookmarks", payload);
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBookmark(b: BookmarkItem) {
    if (!confirm(`删除书签「${b.title}」？`)) return;
    try {
      await apiDelete(`/api/bookmarks?id=${encodeURIComponent(b.id)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function copyBookmark(b: BookmarkItem) {
    try {
      await navigator.clipboard.writeText(b.url);
    } catch {
      /* ignore */
    }
  }

  async function toggleNetwork(b: BookmarkItem) {
    const next = b.url;
    const other = b.internal_url ?? "";
    await apiPatch("/api/bookmarks", {
      id: b.id,
      url: other || b.url,
      internal_url: other ? b.url : b.internal_url,
    });
    await load();
    void next;
  }

  async function toggleCollapse(g: GroupItem) {
    try {
      await apiPatch("/api/groups", { id: g.id, collapsed: g.collapsed ? 0 : 1 });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }

  // ---------- 分组操作 ----------
  async function addGroup() {
    const name = prompt("新分组名称");
    if (!name?.trim()) return;
    try {
      await apiPost("/api/groups", { name: name.trim(), sort_order: groups.length });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建分组失败");
    }
  }

  async function renameGroup(g: GroupItem) {
    const name = prompt("修改分组名称", g.name);
    if (!name?.trim()) return;
    try {
      await apiPatch("/api/groups", { id: g.id, name: name.trim() });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败");
    }
  }

  async function deleteGroup(g: GroupItem) {
    if (!confirm(`删除分组「${g.name}」？组内书签会移到「未分组」。`)) return;
    try {
      await apiDelete(`/api/groups?id=${encodeURIComponent(g.id)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  // ---------- 卡片操作 ----------
  async function addCard(kind: string, title: string) {
    try {
      await apiPost("/api/cards", {
        kind,
        title,
        config: defaultConfig(kind),
        position: defaultPosition(cards.length),
        sort_order: cards.length,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加卡片失败");
    }
  }

  async function saveCard() {
    if (!cardDraftState) return;
    setSaving(true);
    setCardError("");
    try {
      const payload = {
        kind: cardDraftState.kind,
        title: cardDraftState.title,
        config: cardDraftState.config,
        position: cardDraftState.position,
        visibility: cardDraftState.visibility,
      };
      if (cardDraftState.id) await apiPatch("/api/cards", { id: cardDraftState.id, ...payload });
      else await apiPost("/api/cards", { ...payload, sort_order: cards.length });
      setCardDraftState(null);
      await load();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(c: CardItem) {
    if (!confirm(`删除卡片「${c.title || c.kind}」？`)) return;
    try {
      await apiDelete(`/api/cards?id=${encodeURIComponent(c.id)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function moveCard(id: string, dir: -1 | 1) {
    const idx = cards.findIndex((c) => c.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[idx], next[target]] = [next[target], next[idx]];
    setCards(next);
    try {
      await Promise.all(
        next.map((c, i) => apiPatch("/api/cards", { id: c.id, sort_order: i })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "排序失败");
    }
  }

  // ---------- 拖拽排序 ----------
  async function reorderGroups(fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = [...groups];
    const fi = list.findIndex((g) => g.id === fromId);
    const ti = list.findIndex((g) => g.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = list.splice(fi, 1);
    list.splice(ti, 0, moved);
    setGroups(list);
    try {
      await Promise.all(list.map((g, i) => apiPatch("/api/groups", { id: g.id, sort_order: i })));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "分组排序失败");
    }
  }

  async function reorderBookmarks(groupId: string | null, fromId: string, toId: string) {
    if (fromId === toId) return;
    const g = groups.find((x) => (x.id === "__ungrouped__" ? null : x.id) === groupId);
    if (!g) return;
    const list = [...g.bookmarks];
    const fi = list.findIndex((b) => b.id === fromId);
    const ti = list.findIndex((b) => b.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = list.splice(fi, 1);
    list.splice(ti, 0, moved);
    setGroups((prev) =>
      prev.map((x) =>
        x.id === g.id ? { ...x, bookmarks: list } : x,
      ),
    );
    try {
      await Promise.all(
        list.map((b, i) =>
          apiPatch("/api/bookmarks", { id: b.id, group_id: groupId, sort_order: i }),
        ),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "书签排序失败");
    }
  }

  async function reorderCards(fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = [...cards];
    const fi = list.findIndex((c) => c.id === fromId);
    const ti = list.findIndex((c) => c.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = list.splice(fi, 1);
    list.splice(ti, 0, moved);
    setCards(list);
    try {
      await Promise.all(list.map((c, i) => apiPatch("/api/cards", { id: c.id, sort_order: i })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "卡片排序失败");
    }
  }

  function onDrop(e: React.DragEvent) {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const targetId = (e.currentTarget as HTMLElement).dataset.dragId;
    if (!targetId) return;
    if (d.kind === "group") void reorderGroups(d.id, targetId);
    else if (d.kind === "card") void reorderCards(d.id, targetId);
    else {
      const gid = (e.currentTarget as HTMLElement).dataset.groupId ?? null;
      void reorderBookmarks(gid, d.id, targetId);
    }
  }

  const background = shell.settings.background?.trim();
  const blur = Number(shell.settings.backgroundBlur ?? 0);
  const dim = Number(shell.settings.backgroundDim ?? 0);

  return (
    <div className="min-h-screen">
      {background && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center"
          style={{
            backgroundImage: `url(${background})`,
            filter: blur ? `blur(${blur}px)` : undefined,
            opacity: dim ? dim / 100 : 1,
          }}
        />
      )}

      <TopBar>
        <GlobalSearch value={query} onChange={setQuery} />
      </TopBar>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            {shell.settings.siteTitle || "我的导航"}
          </h1>
          {shell.settings.siteSubtitle && (
            <span className="text-sm text-muted">{shell.settings.siteSubtitle}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {shell.user && (
              <button className="btn" onClick={() => setPanelOpen(true)}>
                卡片墙
              </button>
            )}
            {shell.user && (
              <button className="btn" onClick={() => setDraft(emptyDraft(null))}>
                + 书签
              </button>
            )}
            {shell.user && (
              <button className="btn" onClick={() => void addGroup()}>
                + 分组
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-20 text-center text-sm text-muted">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">
            {query.trim() ? "没有匹配的书签" : "还没有内容，去添加一个书签吧"}
          </p>
        ) : (
          filtered.map((g) => (
            <div
              key={g.id}
              data-drag-id={g.id}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <BookmarkGroup
                group={g}
                density={shell.density}
                query={query}
                internalMode={internalMode}
                onPublicNetwork={onPublicNetwork}
                onToggleCollapse={toggleCollapse}
                onEdit={(b) => setDraft(draftFrom(b))}
                onDelete={deleteBookmark}
                onToggleNetwork={toggleNetwork}
                onCopy={copyBookmark}
                onAddBookmark={(gid) => setDraft(emptyDraft(gid))}
                onEditGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                onDragGroupStart={() => setDrag({ kind: "group", id: g.id })}
                onDragGroupEnd={() => setDrag(null)}
                onDragBookmarkStart={(_e, b) => {
                  if (_e) setDrag({ kind: "bookmark", id: b.id, groupId: g.id === "__ungrouped__" ? null : g.id });
                  else setDrag(null);
                }}
                onDropBookmark={(e, target) => {
                  e.stopPropagation();
                  const d = dragRef.current;
                  setDrag(null);
                  if (d?.kind !== "bookmark") return;
                  const gid = g.id === "__ungrouped__" ? null : g.id;
                  void reorderBookmarks(gid, d.id, target.id);
                }}
                onDropGroup={(e, target) => {
                  e.stopPropagation();
                  const d = dragRef.current;
                  setDrag(null);
                  if (d?.kind === "group") void reorderGroups(d.id, target.id);
                }}
              />
            </div>
          ))
        )}

        {/* 卡片墙 */}
        {cards.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold">卡片墙</h2>
              <span className="text-xs text-muted">{cards.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {cards.map((c) => (
                <div
                  key={c.id}
                  data-drag-id={c.id}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <CardWallItem
                    card={c}
                    draggable
                    onDragStart={() => setDrag({ kind: "card", id: c.id })}
                    onDragEnd={() => setDrag(null)}
                    onEdit={(x) => setCardDraftState(cardDraftFrom(x))}
                    onDelete={deleteCard}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {draft && (
        <BookmarkEditor
          draft={draft}
          groups={groups
            .filter((g) => g.id !== "__ungrouped__")
            .map((g) => ({ id: g.id, name: g.name }))}
          onChange={setDraft}
          onSubmit={saveBookmark}
          onCancel={() => {
            setDraft(null);
            setFormError("");
          }}
          busy={saving}
          error={formError}
        />
      )}

      {cardDraftState && (
        <CardEditor
          draft={cardDraftState}
          onChange={setCardDraftState}
          onSubmit={saveCard}
          onCancel={() => {
            setCardDraftState(null);
            setCardError("");
          }}
          busy={saving}
          error={cardError}
        />
      )}

      <AddCardPanel
        open={panelOpen}
        cards={cards}
        onClose={() => setPanelOpen(false)}
        onCreate={addCard}
        onEdit={(c) => {
          setPanelOpen(false);
          setCardDraftState(cardDraftFrom(c));
        }}
        onDelete={deleteCard}
        onMove={moveCard}
      />
    </div>
  );
}
