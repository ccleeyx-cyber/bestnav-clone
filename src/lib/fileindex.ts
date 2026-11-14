/**
 * 本地文件语义搜索索引。
 *
 * 对配置目录下的文件建立 SQLite FTS5 全文索引，索引与向量全部留在本机。
 * 目录来源：settings 表 key='fileindex.roots'（JSON 数组，路径字符串）。
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { getJSON, setJSON, now } from "./db";

const INDEX_DIR = process.env.BESTNAV_DATA_DIR ?? join(process.cwd(), "data");
const INDEX_PATH = join(INDEX_DIR, "fileindex.db");

const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg",
  ".log", ".csv", ".tsv", ".html", ".htm", ".xml", ".csv", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sh", ".ps1", ".sql",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", "__pycache__"]);

let _db: DatabaseSync | null = null;

function indexDb(): DatabaseSync {
  if (_db) return _db;
  const d = new DatabaseSync(INDEX_PATH);
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files USING fts5(
      path, name, ext, content, tokenize='unicode61'
    );
  `);
  _db = d;
  return d;
}

export function getIndexRoots(): string[] {
  return getJSON<string[]>("fileindex.roots", []);
}

export function setIndexRoots(roots: string[]) {
  setJSON("fileindex.roots", roots);
}

function walk(root: string, out: { path: string; name: string; ext: string }[], limit = 20000) {
  if (out.length >= limit) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.startsWith(".") && e !== ".env") continue;
    if (SKIP_DIRS.has(e)) continue;
    const full = join(root, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out, limit);
    } else if (st.isFile()) {
      const ext = extname(e).toLowerCase();
      if (TEXT_EXT.has(ext) || ext === "") {
        out.push({ path: full, name: e, ext });
      }
    }
  }
}

export async function rebuildIndex(): Promise<number> {
  const roots = getIndexRoots();
  const d = indexDb();
  d.exec("DELETE FROM files");
  const insert = d.prepare("INSERT INTO files(path, name, ext, content) VALUES(?,?,?,?)");
  const files: { path: string; name: string; ext: string }[] = [];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    walk(r, files);
  }
  d.exec("BEGIN");
  try {
    for (const f of files) {
      let content = "";
      try {
        const st = statSync(f.path);
        if (st.size <= 2 * 1024 * 1024) content = readFileSync(f.path, "utf8");
      } catch {
        content = "";
      }
      insert.run(f.path, f.name, f.ext, content);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  setJSON("fileindex.rebuilt_at", now());
  return files.length;
}

export function searchFiles(query: string, limit = 50): { path: string; name: string; snippet: string }[] {
  const d = indexDb();
  const q = query.replace(/["']/g, " ").trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(" OR ");
  try {
    const rows = d
      .prepare(
        "SELECT path, name, snippet(files, 3, '', '', '…', 12) AS s FROM files WHERE files MATCH ? LIMIT ?",
      )
      .all(terms, limit) as { path: string; name: string; s: string }[];
    return rows.map((r) => ({ path: r.path, name: r.name, snippet: r.s }));
  } catch {
    return [];
  }
}
