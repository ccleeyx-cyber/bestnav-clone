import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { run } from "@/lib/db";
import { currentUser, SESSION_COOKIE } from "@/lib/session";
import { audit } from "@/lib/auth";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 退出登录：删除服务端会话行并清空 cookie。
 * （放在 /api/settings 下，因为 api/auth 由 lead 负责。）
 */
export async function POST(req: Request) {
  const u = await currentUser();
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE)?.value;
  if (tok) {
    run(
      "DELETE FROM sessions WHERE token_hash = ?",
      createHash("sha256").update(tok).digest("hex"),
    );
  }
  if (u) {
    audit(u.id, "logout", u.username, {}, req.headers.get("x-forwarded-for") ?? "");
  }
  const res = ok({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
