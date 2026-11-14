import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const DATA_DIR = process.env.BESTNAV_DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "bestnav.db");

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));
  _db = d;
  return d;
}

export function now(): string {
  return new Date().toISOString();
}

export function uid(prefix = ""): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function json<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Row helpers — node:sqlite returns null-prototype objects. */
export function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...(params as never[]));
}

export function setting(key: string, fallback = ""): string {
  const r = one<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return r?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  run(
    "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    key,
    value,
    now(),
  );
}

export function getJSON<T>(key: string, fallback: T): T {
  return json<T>(setting(key), fallback);
}

export function setJSON(key: string, value: unknown) {
  setSetting(key, JSON.stringify(value));
}
