import { NextResponse } from "next/server";
import { fail } from "./api";
import { findRelayToken, tokenAllowed, pickRelays, markRelayState, recordUsage } from "./relay";

export async function relayChatCompletions(req: Request): Promise<NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return fail("缺少 Bearer 令牌", 401);

  const tok = findRelayToken(raw);
  if (!tok) return fail("令牌无效", 401);
  if (!tok.enabled) return fail("令牌已停用", 403);

  const body = await req.json().catch(() => null);
  const model = String(body?.model ?? "");
  if (!model) return fail("缺少 model", 422);
  if (!tokenAllowed(tok, model)) return fail("该令牌无权使用此模型或已超预算", 403);

  const choices = pickRelays(model);
  if (!choices.length) return fail("没有可用的上游中转站", 503);

  let lastError = "所有上游均失败";
  for (const c of choices) {
    const started = Date.now();
    try {
      const upstream = await fetch(`${c.relay.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${c.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await upstream.text();
      const latency = Date.now() - started;

      if (upstream.status >= 400 && upstream.status < 500) {
        markRelayState(c.relay.id, "healthy", 0);
        return new NextResponse(text, {
          status: upstream.status,
          headers: { "content-type": "application/json" },
        });
      }
      if (!upstream.ok) {
        markRelayState(c.relay.id, "cooldown", 60_000);
        lastError = `上游 ${c.relay.name} 返回 ${upstream.status}`;
        continue;
      }

      markRelayState(c.relay.id, "healthy", 0);
      let usage = { prompt_tokens: 0, completion_tokens: 0 };
      try {
        const parsed = JSON.parse(text);
        const u = parsed?.usage;
        if (u) {
          usage.prompt_tokens = u.prompt_tokens ?? u.input_tokens ?? 0;
          usage.completion_tokens = u.completion_tokens ?? u.output_tokens ?? 0;
        }
      } catch {
        /* 非 JSON 响应，跳过用量统计 */
      }

      recordUsage({
        relayId: c.relay.id,
        tokenId: tok.id,
        model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        latencyMs: latency,
        statusCode: upstream.status,
      });
      return new NextResponse(text, {
        status: 200,
        headers: { "content-type": "application/json", "x-bn-relay": c.relay.name },
      });
    } catch (e) {
      markRelayState(c.relay.id, "cooldown", 60_000);
      lastError = `上游 ${c.relay.name} 请求失败：${(e as Error).message}`;
    }
  }
  return fail(lastError, 502);
}
