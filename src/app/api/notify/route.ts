import { z } from "zod";
import { fail, ok, requireUser, isResponse } from "@/lib/api";
import { audit } from "@/lib/auth";
import {
  CHANNEL_KINDS,
  createNotification,
  deleteNotification,
  getNotification,
  listNotifications,
  maskConfig,
  safeParse,
  updateNotification,
  type ChannelKind,
} from "@/lib/notify";

export const dynamic = "force-dynamic";

const ConfigSchema = z
  .object({
    webhook: z.string().max(1000).optional(),
    secret: z.string().max(500).optional(),
    token: z.string().max(500).optional(),
    chatId: z.string().max(200).optional(),
    botToken: z.string().max(500).optional(),
    deviceKey: z.string().max(500).optional(),
    topic: z.string().max(200).optional(),
    priority: z.number().int().min(0).max(10).optional(),
    title: z.string().max(200).optional(),
    method: z.string().max(10).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    bodyTemplate: z.string().max(4000).optional(),
  })
  .default({});

const CreateSchema = z.object({
  channel: z.enum(CHANNEL_KINDS as [ChannelKind, ...ChannelKind[]]),
  config: ConfigSchema,
  enabled: z.boolean().optional(),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(CHANNEL_KINDS as [ChannelKind, ...ChannelKind[]]).optional(),
  config: ConfigSchema.optional(),
  enabled: z.boolean().optional(),
});

/** GET /api/notify — list channels (sensitive values masked) */
export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const list = listNotifications().map((n) => ({
    id: n.id,
    channel: n.channel,
    enabled: !!n.enabled,
    created_at: n.created_at,
    config: maskConfig(safeParse(n.config)),
  }));
  return ok({ channels: list, kinds: CHANNEL_KINDS });
}

/** POST /api/notify — create a channel */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());

  const row = createNotification(parsed.data.channel, parsed.data.config);
  if (parsed.data.enabled === false) {
    updateNotification(row.id, { enabled: false });
  }
  audit(u.id, "notify.channel.create", row.id, { channel: parsed.data.channel }, req.headers.get("x-forwarded-for") ?? "");
  const fresh = getNotification(row.id)!;
  return ok({
    id: fresh.id,
    channel: fresh.channel,
    enabled: !!fresh.enabled,
    config: maskConfig(safeParse(fresh.config)),
  });
}

/** PATCH /api/notify — update a channel */
export async function PATCH(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return fail("参数校验失败", 422, parsed.error.flatten());
  const d = parsed.data;

  const updated = updateNotification(d.id, {
    channel: d.channel,
    config: d.config,
    enabled: d.enabled,
  });
  if (!updated) return fail("通道不存在", 404);
  audit(u.id, "notify.channel.update", d.id, { channel: updated.channel, enabled: !!updated.enabled }, req.headers.get("x-forwarded-for") ?? "");
  return ok({
    id: updated.id,
    channel: updated.channel,
    enabled: !!updated.enabled,
    config: maskConfig(safeParse(updated.config)),
  });
}

/** DELETE /api/notify?id= */
export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResponse(u)) return u;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少 id", 422);
  const okDel = deleteNotification(id);
  if (!okDel) return fail("通道不存在", 404);
  audit(u.id, "notify.channel.delete", id, {}, req.headers.get("x-forwarded-for") ?? "");
  return ok({ id, deleted: true });
}
