import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { one, run, now, uid } from "./db";

const SECRET = new TextEncoder().encode(
  process.env.BESTNAV_SECRET ?? "bestnav-clone-dev-secret-change-me",
);

export type Role = "owner" | "admin" | "member";

export interface User {
  id: string;
  username: string;
  role: Role;
  display_name: string;
  enabled: number;
  created_at: string;
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === calc.length && timingSafeEqual(known, calc);
}

export function getUserByUsername(username: string) {
  return one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE username = ?",
    username,
  );
}

export function getUser(id: string) {
  return one<User>("SELECT id, username, role, display_name, enabled, created_at FROM users WHERE id = ?", id);
}

export function listUsers(): User[] {
  const { rows } = require("./db") as typeof import("./db");
  return rows<User>("SELECT id, username, role, display_name, enabled, created_at FROM users ORDER BY created_at ASC");
}

export function createUser(
  username: string,
  password: string,
  role: Role = "member",
  displayName = "",
): User {
  const id = uid("u_");
  const ts = now();
  run(
    "INSERT INTO users(id, username, password_hash, role, display_name, enabled, created_at, updated_at) VALUES(?,?,?,?,?,1,?,?)",
    id,
    username,
    hashPassword(password),
    role,
    displayName || username,
    ts,
    ts,
  );
  return getUser(id)!;
}

export function countUsers(): number {
  const r = one<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  return r?.n ?? 0;
}

export async function issueToken(userId: string, userAgent = ""): Promise<string> {
  const id = uid("s_");
  const token = randomBytes(32).toString("hex");
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  run(
    "INSERT INTO sessions(id, user_id, token_hash, created_at, expires_at, user_agent) VALUES(?,?,?,?,?,?)",
    id,
    userId,
    tokenHash,
    now(),
    expires,
    userAgent,
  );
  return token;
}

export async function verifyToken(token: string): Promise<User | null> {
  if (!token) return null;
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = one<{ user_id: string; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
    tokenHash,
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
    return null;
  }
  const u = getUser(row.user_id);
  return u && u.enabled ? u : null;
}

/** MCP bearer tokens are long-lived and stored hashed. */
export function issueMcpToken(userId: string): string {
  const raw = `bn_mcp_${randomBytes(24).toString("hex")}`;
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  run(
    "INSERT INTO sessions(id, user_id, token_hash, created_at, expires_at, user_agent) VALUES(?,?,?,?,?,?)",
    uid("s_"),
    userId,
    createHash("sha256").update(raw).digest("hex"),
    now(),
    new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
    "mcp",
  );
  return raw;
}

export async function signJwt(payload: Record<string, unknown>, expiresIn = "7d") {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(SECRET);
}

export async function readJwt(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export function audit(
  userId: string | null,
  action: string,
  target = "",
  detail: unknown = {},
  ip = "",
) {
  run(
    "INSERT INTO audit_logs(id, user_id, action, target, detail, ip, created_at) VALUES(?,?,?,?,?,?,?)",
    uid("a_"),
    userId,
    action,
    target,
    JSON.stringify(detail),
    ip,
    now(),
  );
}

export function hasAdmin(): boolean {
  const r = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role IN ('owner','admin') AND enabled=1");
  return (r?.n ?? 0) > 0;
}
