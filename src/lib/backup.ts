/**
 * 备份 / 恢复 —— 纯 Node 内置实现，零新依赖。
 *
 * ZIP：手写最小 ZIP 写入/读取器放在 src/lib/zip.ts（可复用），这里只负责业务编排。
 * 加密：密码用 src/lib/crypto.ts 的 encryptSecret/decryptSecret
 *      （scrypt(BESTNAV_SECRET) 派生密钥 + AES-256-GCM）。
 * 定时：模块级单例 setInterval（挂在 globalThis 上，dev 热重载也只留一个）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DATA_DIR, db, now, rows, run, setting, setSetting, uid } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildZip, readZip } from "@/lib/zip";

/* ------------------------------------------------------------------ */
/* 备份表清单                                                          */
/* ------------------------------------------------------------------ */

/** 参与备份的表，顺序即恢复顺序（满足外键依赖）。 */
export const BACKUP_TABLES = [
  "users",
  "groups",
  "bookmarks",
  "cards",
  "settings",
  "notes",
  "calendar_events",
  "search_sources",
  "navpacks",
  "relays",
  "api_keys",
  "monitors",
  "notifications",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** 恢复时允许写入的表白名单（防止任意表注入）。 */
const RESTORE_TABLES = new Set<string>(BACKUP_TABLES);

/* ------------------------------------------------------------------ */
/* 导出 / 导入                                                         */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  format: "bestnav-backup";
  version: 1;
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

function tableExists(name: string): boolean {
  const r = rows<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",
    name,
  );
  return (r[0]?.n ?? 0) > 0;
}

export function collectBackupPayload(): BackupPayload {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) {
    if (!tableExists(t)) continue;
    tables[t] = rows<Record<string, unknown>>(`SELECT * FROM ${t}`).map((r) => ({ ...r }));
  }
  return { format: "bestnav-backup", version: 1, created_at: now(), tables };
}

export function backupsDir(): string {
  const dir = join(DATA_DIR, "backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function stampName(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export interface BackupResult {
  id: string;
  path: string;
  filename: string;
  size: number;
  created_at: string;
  kind: string;
}
/**
 * 生成一个备份 zip 并落盘、登记到 backups 表。
 * 返回落盘路径（控制室「立即备份」开关依赖这个签名）。
 */
export async function createBackup(kind: string = "manual"): Promise<string> {
  const payload = collectBackupPayload();
  const json = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const meta = Buffer.from(
    JSON.stringify(
      {
        format: payload.format,
        version: payload.version,
        created_at: payload.created_at,
        tables: Object.keys(payload.tables),
      },
      null,
      2,
    ),
    "utf8",
  );
  const zip = buildZip([
    { name: "manifest.json", data: meta },
    { name: "data.json", data: json },
  ]);

  const filename = `bestnav-backup-${stampName()}.zip`;
  const dir = backupsDir();
  const path = join(dir, filename);
  writeFileSync(path, zip);

  const id = uid("b_");
  const ts = now();
  run(
    "INSERT INTO backups(id, kind, path, size, created_at) VALUES(?,?,?,?,?)",
    id,
    kind,
    path,
    zip.length,
    ts,
  );
  return path;
}

/** 与 createBackup 同义，返回完整记录。 */
export async function createBackupRecord(
  kind: "manual" | "scheduled" | "webdav" = "manual",
): Promise<BackupResult> {
  const path = await createBackup(kind);
  const row = rows<BackupRow>(
    "SELECT * FROM backups WHERE path = ? ORDER BY created_at DESC LIMIT 1",
    path,
  )[0];
  return {
    id: row?.id ?? "",
    path,
    filename: path.split(/[\\/]/).pop() ?? path,
    size: row?.size ?? fileSize(path),
    created_at: row?.created_at ?? now(),
    kind: row?.kind ?? kind,
  };
}

export interface RestoreResult {
  tables: { table: string; rows: number }[];
}

/** 从 zip 恢复：在一个事务里逐表清空并插入，失败整体回滚。 */
export function restoreFromZip(zipPath: string): RestoreResult {
  const abs = resolve(zipPath);
  if (!abs.startsWith(resolve(backupsDir()))) {
    throw new Error("只允许从备份目录恢复");
  }
  if (!existsSync(abs)) throw new Error("备份文件不存在");

  const entries = readZip(readFileSync(abs));
  const dataBuf = entries.get("data.json");
  if (!dataBuf) throw new Error("备份缺少 data.json");

  const payload = JSON.parse(dataBuf.toString("utf8")) as BackupPayload;
  if (payload.format !== "bestnav-backup") throw new Error("备份格式不正确");

  const summary: { table: string; rows: number }[] = [];
  const conn = db();

  // sessions 不在备份表清单里，但恢复 users 时 ON DELETE CASCADE 会连带删掉当前登录会话，
  // 导致操作者被自己踢下线。这里在事务外先记住当前会话，恢复后原样写回。
  const currentSessionRows = rows<{ id: string; user_id: string; token_hash: string; created_at: string; expires_at: string; user_agent: string | null }>(
    "SELECT id, user_id, token_hash, created_at, expires_at, user_agent FROM sessions",
  );

  conn.exec("BEGIN IMMEDIATE");
  try {
    for (const t of BACKUP_TABLES) {
      const data = payload.tables?.[t];
      if (!data || !RESTORE_TABLES.has(t) || !tableExists(t)) continue;
      conn.exec(`DELETE FROM ${t}`);
      if (data.length === 0) {
        summary.push({ table: t, rows: 0 });
        continue;
      }
      const cols = Object.keys(data[0]);
      const sql = `INSERT INTO ${t}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`;
      for (const row of data) {
        const values = cols.map((c) => {
          const v = (row as Record<string, unknown>)[c];
          if (v === undefined || v === null) return null;
          if (typeof v === "boolean") return v ? 1 : 0;
          if (typeof v === "object") return JSON.stringify(v);
          return v as unknown;
        });
        conn.prepare(sql).run(...(values as never[]));
      }
      summary.push({ table: t, rows: data.length });
    }

    // 写回原有会话（用户仍在备份中时），避免恢复后操作者被踢下线。
    for (const s of currentSessionRows) {
      const stillThere = rows<{ n: number }>(
        "SELECT COUNT(*) AS n FROM users WHERE id = ?",
        s.user_id,
      )[0]?.n ?? 0;
      if (!stillThere) continue;
      conn
        .prepare(
          "INSERT OR REPLACE INTO sessions(id, user_id, token_hash, created_at, expires_at, user_agent) VALUES(?,?,?,?,?,?)",
        )
        .run(s.id, s.user_id, s.token_hash, s.created_at, s.expires_at, s.user_agent);
    }

    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
  return { tables: summary };
}

/* ------------------------------------------------------------------ */
/* WebDAV 异地备份                                                     */
/* ------------------------------------------------------------------ */

export interface WebdavConfig {
  url: string;
  user: string;
  /** 落盘时已被加密，绝不返回明文 */
  passwordEnc: string;
}

const SETTING_WEBDAV = "backup.webdav";

export function getWebdavConfig(): WebdavConfig | null {
  const raw = setting(SETTING_WEBDAV, "");
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as WebdavConfig;
    if (!c.url) return null;
    return c;
  } catch {
    return null;
  }
}

export function setWebdavConfig(cfg: { url: string; user: string; password: string }) {
  const enc = encryptSecret(cfg.password);
  setSetting(SETTING_WEBDAV, JSON.stringify({ url: cfg.url, user: cfg.user, passwordEnc: enc }));
}

export function webdavAuthHeader(cfg: WebdavConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cfg.user) {
    const pass = cfg.passwordEnc ? decryptSecret(cfg.passwordEnc) : "";
    const token = Buffer.from(`${cfg.user}:${pass}`, "utf8").toString("base64");
    headers["authorization"] = `Basic ${token}`;
  }
  return headers;
}

/** 写前连接测试：PROPFIND。 */
export async function testWebdav(cfg: WebdavConfig): Promise<{ ok: boolean; status: number; message: string }> {
  try {
    const res = await fetch(cfg.url, {
      method: "PROPFIND",
      headers: { ...webdavAuthHeader(cfg), depth: "0" },
    });
    if (res.ok || res.status === 207) return { ok: true, status: res.status, message: "连接正常" };
    return { ok: false, status: res.status, message: `服务器返回 ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error ? e.message : "连接失败" };
  }
}

/** PUT 上传备份 zip 到 WebDAV。 */
export async function uploadWebdav(cfg: WebdavConfig, filename: string, data: Buffer) {
  const target = cfg.url.endsWith("/") ? `${cfg.url}${filename}` : `${cfg.url}/${filename}`;
  const res = await fetch(target, {
    method: "PUT",
    headers: { ...webdavAuthHeader(cfg), "content-type": "application/zip" },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`WebDAV 上传失败: ${res.status}`);
  return target;
}

/* ------------------------------------------------------------------ */
/* 定时自动备份（模块级单例）                                          */
/* ------------------------------------------------------------------ */

export const INTERVAL_OPTIONS = [6, 12, 24, 72, 168] as const;
export type IntervalHours = (typeof INTERVAL_OPTIONS)[number];

const SETTING_INTERVAL = "backup.intervalHours";

export function getBackupIntervalHours(): IntervalHours | null {
  const raw = setting(SETTING_INTERVAL, "");
  const n = Number(raw);
  if (!raw) return null;
  return (INTERVAL_OPTIONS as readonly number[]).includes(n) ? (n as IntervalHours) : null;
}

export function setBackupIntervalHours(h: IntervalHours | null) {
  if (h === null) setSetting(SETTING_INTERVAL, "");
  else setSetting(SETTING_INTERVAL, String(h));
}

type GlobalFlag = typeof globalThis & { __bestnavBackupTimer?: NodeJS.Timeout };

/**
 * 启动（幂等）自动备份定时器。模块级单例：dev 热重载也不会重复起。
 * 间隔由 settings['backup.intervalHours'] 决定。
 */
export function ensureBackupScheduler(): void {
  const g = globalThis as GlobalFlag;
  if (g.__bestnavBackupTimer) return;
  const hours = getBackupIntervalHours();
  if (!hours) return;

  const timer = setInterval(() => {
    void (async () => {
      try {
        const path = await createBackup("scheduled");
        // eslint-disable-next-line no-console
        console.log(`[bestnav] 自动备份完成: ${path}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[bestnav] 自动备份失败:", e);
      }
    })();
  }, hours * 3600 * 1000);
  timer.unref?.();
  g.__bestnavBackupTimer = timer;
}

/** 停止定时器（设置里关掉间隔时调用）。 */
export function stopBackupScheduler(): void {
  const g = globalThis as GlobalFlag;
  if (g.__bestnavBackupTimer) {
    clearInterval(g.__bestnavBackupTimer);
    delete g.__bestnavBackupTimer;
  }
}

/* ------------------------------------------------------------------ */
/* 备份列表                                                            */
/* ------------------------------------------------------------------ */

export interface BackupRow {
  id: string;
  kind: string;
  path: string;
  filename?: string;
  size: number;
  created_at: string;
}

export function listBackups(): BackupRow[] {
  return rows<BackupRow>("SELECT * FROM backups ORDER BY created_at DESC LIMIT 200");
}

export function fileSize(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

export function fileExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 清理未被 backups 表登记的历史 zip 文件。 */
export function pruneUnregisteredBackups(): number {
  const dir = backupsDir();
  const known = new Set(rows<{ path: string }>("SELECT path FROM backups").map((r) => resolve(r.path)));
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".zip")) continue;
    const full = resolve(join(dir, f));
    if (known.has(full)) continue;
    try {
      rmSync(full);
      removed++;
    } catch {
      /* 忽略删除失败 */
    }
  }
  return removed;
}
