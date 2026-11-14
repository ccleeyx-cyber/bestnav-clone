import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { setting, setSetting } from "@/lib/db";
import type { TemplateId } from "@/lib/types";

export const dynamic = "force-dynamic";

const TEMPLATES: TemplateId[] = ["classic", "magazine", "console", "desktop"];
const Schema = z.object({ template: z.enum(["classic", "magazine", "console", "desktop"]) });

export async function GET() {
  const raw = setting("template", "classic");
  const template = (TEMPLATES as string[]).includes(raw) ? (raw as TemplateId) : "classic";
  return ok({ template, available: TEMPLATES });
}

export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return fail("未登录", 401);
  if (!can(me, "settings.manage")) return fail("需要管理员权限", 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("请求体不是合法 JSON");
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());

  setSetting("template", parsed.data.template);
  return ok({ template: parsed.data.template });
}
