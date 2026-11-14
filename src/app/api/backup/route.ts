import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  createBackupRecord,
  ensureBackupScheduler,
  getBackupIntervalHours,
  getWebdavConfig,
  INTERVAL_OPTIONS,
  listBackups,
  setBackupIntervalHours,
  setWebdavConfig,
  stopBackupScheduler,
  testWebdav,
  uploadWebdav,
  type IntervalHours,
} from "@/lib/backup";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["backup", "webdav", "test-webdav", "interval"]),
  url: z.string().url().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  hours: z.union([z.literal(0), z.number().int()]).optional(),
});

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

export async function GET() {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "backup.manage")) return fail("需要管理员权限", 403);

  const webdav = getWebdavConfig();
  return ok({
    backups: listBackups(),
    intervalHours: getBackupIntervalHours(),
    intervalOptions: INTERVAL_OPTIONS,
    webdav: webdav ? { url: webdav.url, user: webdav.user, configured: true } : null,
  });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "backup.manage")) return fail("需要管理员权限", 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const { action, url, user, password, hours } = parsed.data;

  if (action === "backup") {
    const result = await createBackupRecord("manual");
    audit(me.id, "backup.create", result.filename, { size: result.size }, clientIp(req));

    // 若配置了 WebDAV，顺手推一份异地副本
    const cfg = getWebdavConfig();
    let webdavResult: { uploaded: boolean; message: string } | null = null;
    if (cfg) {
      try {
        await uploadWebdav(cfg, result.filename, readFileSync(result.path));
        webdavResult = { uploaded: true, message: "异地备份成功" };
      } catch (e) {
        webdavResult = {
          uploaded: false,
          message: e instanceof Error ? e.message : "异地备份失败",
        };
      }
    }
    return ok({ backup: result, webdav: webdavResult });
  }

  if (action === "webdav") {
    if (!url) return fail("缺少 WebDAV 地址");
    setWebdavConfig({ url, user: user ?? "", password: password ?? "" });
    audit(me.id, "backup.webdav_config", url, { user: user ?? "" }, clientIp(req));
    return ok({ ok: true, url, user: user ?? "" });
  }

  if (action === "test-webdav") {
    const cfg = getWebdavConfig();
    if (!cfg) return fail("尚未配置 WebDAV");
    const res = await testWebdav(cfg);
    audit(me.id, "backup.webdav_test", cfg.url, res, clientIp(req));
    return res.ok ? ok(res) : fail(res.message, 502, res);
  }

  if (action === "interval") {
    const h = hours ?? 0;
    if (h === 0) {
      setBackupIntervalHours(null);
      stopBackupScheduler();
      audit(me.id, "backup.interval", "off", {}, clientIp(req));
      return ok({ intervalHours: null });
    }
    if (!(INTERVAL_OPTIONS as readonly number[]).includes(h)) {
      return fail(`不支持的间隔，必须是 ${INTERVAL_OPTIONS.join("/")} 小时之一`);
    }
    setBackupIntervalHours(h as IntervalHours);
    stopBackupScheduler();
    ensureBackupScheduler();
    audit(me.id, "backup.interval", String(h), {}, clientIp(req));
    return ok({ intervalHours: h });
  }

  return fail("未知操作");
}
