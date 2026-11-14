import { cookies, headers } from "next/headers";
import { verifyToken, type User } from "./auth";

export const SESSION_COOKIE = "bn_session";

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const u = await verifyToken(token);
    if (u) return u;
  }
  // Bearer fallback for API clients (MCP / tool API)
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const u = await verifyToken(auth.slice(7));
    if (u) return u;
  }
  return null;
}

export function isAdmin(u: User | null): boolean {
  return !!u && (u.role === "owner" || u.role === "admin");
}
