/**
 * NavPack 导航包。
 *
 * - 内置 15 个官方精选包（种子数据在 scripts/seed.ts）。
 * - 包内站点支持中英双语（同站点两条记录，lang=zh / lang=en）。
 * - 安装：把勾选站点导入 bookmarks，tags 打上包名；已存在 URL 跳过。
 * - 卸载：只移除由该包导入的站点（按 tags 标记回滚）。
 */

import { rows, one, run, now, uid, json } from "./db";

export interface NavPack {
  id: string;
  name: string;
  source: string;
  url: string | null;
  installed_at: string | null;
  updated_at: string;
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

export interface NavPackSummary extends NavPack {
  item_count: number;
  categories: string[];
  langs: string[];
}

export function listPacks(): NavPackSummary[] {
  const packs = rows<NavPack>("SELECT * FROM navpacks ORDER BY source ASC, name ASC");
  const counts = rows<{ pack_id: string; c: number }>(
    "SELECT pack_id, COUNT(*) AS c FROM navpack_items GROUP BY pack_id",
  );
  const countMap = new Map(counts.map((c) => [c.pack_id, c.c]));
  const cats = rows<{ pack_id: string; category: string }>(
    "SELECT pack_id, category FROM navpack_items GROUP BY pack_id, category ORDER BY pack_id, category",
  );
  const langs = rows<{ pack_id: string; lang: string }>(
    "SELECT pack_id, lang FROM navpack_items GROUP BY pack_id, lang ORDER BY pack_id, lang",
  );
  return packs.map((p) => ({
    ...p,
    item_count: countMap.get(p.id) ?? 0,
    categories: [...new Set(cats.filter((c) => c.pack_id === p.id).map((c) => c.category))].filter(Boolean),
    langs: [...new Set(langs.filter((l) => l.pack_id === p.id).map((l) => l.lang))].filter(Boolean),
  }));
}

export function getPack(id: string): NavPack | undefined {
  return one<NavPack>("SELECT * FROM navpacks WHERE id = ?", id);
}

export function getPackItems(packId: string): NavPackItem[] {
  return rows<NavPackItem>(
    "SELECT * FROM navpack_items WHERE pack_id = ? ORDER BY category ASC, lang ASC, title ASC",
    packId,
  );
}

export function getPackSummary(id: string): NavPackSummary | undefined {
  return listPacks().find((p) => p.id === id);
}

export function upsertPack(input: {
  id: string;
  name: string;
  source?: string;
  url?: string | null;
  items: NavPackItem[];
}): NavPack {
  const ts = now();
  const existing = getPack(input.id);
  if (!existing) {
    run(
      "INSERT INTO navpacks(id, name, source, url, installed_at, updated_at) VALUES(?,?,?,?,NULL,?)",
      input.id,
      input.name,
      input.source ?? "official",
      input.url ?? null,
      ts,
    );
  } else {
    run(
      "UPDATE navpacks SET name=?, source=?, url=?, updated_at=? WHERE id=?",
      input.name,
      input.source ?? existing.source,
      input.url ?? existing.url,
      ts,
      input.id,
    );
  }
  run("DELETE FROM navpack_items WHERE pack_id = ?", input.id);
  for (const it of input.items) {
    run(
      `INSERT INTO navpack_items(id, pack_id, title, url, category, lang, description)
       VALUES(?,?,?,?,?,?,?)`,
      it.id,
      input.id,
      it.title,
      it.url,
      it.category ?? "",
      it.lang ?? "zh",
      it.description ?? "",
    );
  }
  return getPack(input.id)!;
}

export function deletePack(id: string): boolean {
  if (!getPack(id)) return false;
  run("DELETE FROM navpacks WHERE id = ?", id);
  return true;
}

export interface InstallResult {
  added: number;
  skipped: number;
  packId: string;
}

/** 把包内勾选站点导入 bookmarks。tags 打上包名，便于按包回滚。 */
export function installPack(packId: string, itemIds?: string[], ownerId?: string | null): InstallResult {
  const pack = getPack(packId);
  if (!pack) throw new Error("导航包不存在");
  const all = getPackItems(packId);
  const targets = itemIds && itemIds.length ? all.filter((i) => itemIds.includes(i.id)) : all;
  let added = 0;
  let skipped = 0;
  const ts = now();
  for (const item of targets) {
    // 同包内中英双语条目共享同一 URL：按 (url, title) 判重，避免「译名」被误判为已存在。
    const dup = one<{ id: string }>(
      "SELECT id FROM bookmarks WHERE url = ? AND title = ? LIMIT 1",
      item.url,
      item.title,
    );
    if (dup) {
      skipped += 1;
      continue;
    }
    const tagName = `navpack:${pack.name}`;
    const id = uid("bm_");
    run(
      `INSERT INTO bookmarks(id, group_id, title, url, internal_url, description, icon, icon_color, tags, visibility, owner_id, sort_order, enabled, created_at, updated_at)
       VALUES(?,NULL,?,?,NULL,?,?,'',?,?,?,0,1,?,?)`,
      id,
      item.title,
      item.url,
      item.description ?? "",
      "",
      JSON.stringify([tagName]),
      "private",
      ownerId ?? null,
      ts,
      ts,
    );
    added += 1;
  }
  run("UPDATE navpacks SET installed_at = ?, updated_at = ? WHERE id = ?", ts, ts, packId);
  return { added, skipped, packId };
}

/** 只移除属于该包导入的站点（tags 含 navpack:<包名>）。 */
export function uninstallPack(packId: string): { removed: number; packId: string } {
  const pack = getPack(packId);
  if (!pack) throw new Error("导航包不存在");
  const tagName = `navpack:${pack.name}`;
  const candidates = rows<{ id: string; tags: string }>("SELECT id, tags FROM bookmarks");
  let removed = 0;
  for (const b of candidates) {
    const tags = json<string[]>(b.tags, []);
    if (!tags.includes(tagName)) continue;
    run("DELETE FROM bookmarks WHERE id = ?", b.id);
    removed += 1;
  }
  run("UPDATE navpacks SET installed_at = NULL, updated_at = ? WHERE id = ?", now(), packId);
  return { removed, packId };
}

export interface ImportPayload {
  name: string;
  items: { title: string; url: string; category?: string; lang?: string; description?: string }[];
}

/** 校验外部 JSON 包格式。 */
export function validateImportPayload(raw: unknown): ImportPayload {
  if (!raw || typeof raw !== "object") throw new Error("包内容必须是 JSON 对象");
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) throw new Error("包内容缺少 name 字段");
  const rawItems = Array.isArray(o.items) ? o.items : null;
  if (!rawItems) throw new Error("包内容缺少 items 数组");
  const items = rawItems
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const i = it as Record<string, unknown>;
      const title = typeof i.title === "string" ? i.title.trim() : "";
      const url = typeof i.url === "string" ? i.url.trim() : "";
      if (!title || !url) return null;
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        title,
        url,
        category: typeof i.category === "string" ? i.category : "",
        lang: typeof i.lang === "string" ? i.lang : "zh",
        description: typeof i.description === "string" ? i.description : "",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!items.length) throw new Error("包内容没有任何合法条目（需要 title + http(s) url）");
  return { name, items };
}

export async function importPackFromUrl(url: string): Promise<NavPackSummary> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("包地址不是合法 URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("包地址必须以 http:// 或 https:// 开头");
  }
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      res = await fetch(parsedUrl.toString(), {
        signal: ctrl.signal,
        headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.8" },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    throw new Error(`拉取包失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`拉取包失败：HTTP ${res.status}`);
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("包内容不是合法 JSON");
  }
  const payload = validateImportPayload(raw);
  const id = `custom-${slug(payload.name)}-${uid()}`;
  upsertPack({
    id,
    name: payload.name,
    source: "custom",
    url: parsedUrl.toString(),
    items: payload.items.map((i, idx) => ({
      id: `${id}-${idx}`,
      pack_id: id,
      title: i.title,
      url: i.url,
      category: i.category ?? "",
      lang: i.lang ?? "zh",
      description: i.description ?? "",
    })),
  });
  return getPackSummary(id)!;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\w一-龥-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "pack"
  );
}
