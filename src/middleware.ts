/**
 * 访客统计埋点（Edge runtime）。
 *
 * middleware 跑在 Edge runtime，不能访问 node:sqlite，
 * 因此这里只负责把「本次访问」的元信息（IP / UA / Referer / 路径）
 * 转发到同源的内部采集接口 /api/visitors/track（Node runtime，落库）。
 *
 * 说明：
 *  - 若项目里已有别的 middleware，请把本文件的逻辑合并进去（Next.js 只允许一个 middleware）。
 *  - 埋点失败必须完全静默，不能影响页面响应。
 */
import { NextResponse, type NextRequest } from "next/server";

const SKIP_PREFIXES = ["/api/", "/_next/", "/favicon", "/icons", "/static/"];

export function middleware(req: NextRequest, event: { waitUntil?: (p: Promise<unknown>) => void }) {
  const { pathname } = req.nextUrl;
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  // RSC / prefetch 请求不计 PV，避免一次导航被记两次
  if (req.headers.get("rsc") || req.headers.get("next-router-prefetch")) {
    return NextResponse.next();
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  const target = new URL("/api/visitors/track", req.nextUrl.origin);
  const p = fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bn-visit-ip": ip,
      "x-bn-visit-ua": req.headers.get("user-agent") ?? "",
      "x-bn-visit-ref": req.headers.get("referer") ?? "",
      "x-bn-visit-path": pathname,
    },
    body: JSON.stringify({ path: pathname }),
  }).catch(() => undefined);

  if (event.waitUntil) event.waitUntil(p);

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
