import { fail, ok } from "@/lib/api";
import { recordVisit } from "@/lib/visitors";

export const dynamic = "force-dynamic";

/**
 * 访客埋点落库接口。由 middleware 以服务端 fetch 方式调用（带内部头），
 * 也可被同源页面直接调用。只接受同源请求。
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return fail("跨域请求被拒绝", 403);
    } catch {
      return fail("来源不合法", 403);
    }
  }

  const ip = req.headers.get("x-bn-visit-ip") ?? "";
  const ua = req.headers.get("x-bn-visit-ua") ?? "";
  const referrer = req.headers.get("x-bn-visit-ref") ?? "";
  let path = req.headers.get("x-bn-visit-path") ?? "/";
  if (!path) {
    try {
      const body = (await req.json()) as { path?: string };
      path = body.path ?? "/";
    } catch {
      path = "/";
    }
  }

  const okVisit = recordVisit({ path, ip, ua, referrer, host: host ?? "" });
  return ok({ recorded: okVisit });
}
