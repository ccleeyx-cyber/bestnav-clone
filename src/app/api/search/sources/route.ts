import { ok, fail, isResponse, requireUser } from "@/lib/api";
import {
  listSources,
  createSource,
  updateSource,
  deleteSource,
  CATEGORIES,
  isCategory,
} from "@/lib/aggregate-search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  try {
    return ok({ categories: CATEGORIES, sources: listSources(category) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const category = typeof body.category === "string" ? body.category : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const urlTemplate = typeof body.url_template === "string" ? body.url_template.trim() : "";
  if (!isCategory(category)) return fail("category 必须是 12 个分类之一", 422);
  if (!name) return fail("name 不能为空", 422);
  if (!urlTemplate) return fail("url_template 不能为空", 422);
  if (!urlTemplate.includes("{q}")) return fail("url_template 必须包含 {q} 占位符", 422);
  try {
    const src = createSource({
      category,
      name,
      url_template: urlTemplate,
      icon: typeof body.icon === "string" ? body.icon : "",
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
      enabled: body.enabled !== false,
    });
    return ok(src);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return fail("缺少 id", 422);
  const patch: Parameters<typeof updateSource>[1] = {};
  if (typeof body.category === "string") {
    if (!isCategory(body.category)) return fail("category 非法", 422);
    patch.category = body.category;
  }
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.url_template === "string") {
    if (!body.url_template.includes("{q}")) return fail("url_template 必须包含 {q} 占位符", 422);
    patch.url_template = body.url_template;
  }
  if (typeof body.icon === "string") patch.icon = body.icon;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  try {
    const src = updateSource(id, patch);
    if (!src) return fail("源不存在", 404);
    return ok(src);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const url = new URL(req.url);
  let id = url.searchParams.get("id") ?? "";
  if (!id) {
    try {
      const body = (await req.json()) as { id?: unknown };
      id = typeof body.id === "string" ? body.id : "";
    } catch {
      /* ignore */
    }
  }
  if (!id) return fail("缺少 id", 422);
  try {
    const removed = deleteSource(id);
    if (!removed) return fail("源不存在", 404);
    return ok({ id, deleted: true });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
