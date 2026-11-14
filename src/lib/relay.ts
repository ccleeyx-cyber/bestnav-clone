import { one, rows, run, now, uid, json } from "./db";
import { decryptSecret, hashKey } from "./crypto";
import { computeCost } from "./pricing";

export interface RelayRow {
  id: string;
  name: string;
  base_url: string;
  api_key_enc: string;
  models: string;
  priority: number;
  enabled: number;
  weight: number;
  health_state: string;
  cooldown_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface RelayChoice {
  relay: RelayRow;
  apiKey: string;
  models: string[];
}

const COOLDOWN_MS = 60_000;

/** 四层降级：同模型可用中继 → 同模型冷却中 → 任意模型可用中继 → 任意中继。 */
export function pickRelays(model: string): RelayChoice[] {
  const all = rows<RelayRow>(
    "SELECT * FROM relays WHERE enabled = 1 ORDER BY priority ASC, weight DESC",
  );
  const nowTs = Date.now();
  const usable = all.filter(
    (r) => r.health_state !== "disabled" && (!r.cooldown_until || new Date(r.cooldown_until).getTime() <= nowTs),
  );
  const modelList = (r: RelayRow) => json<string[]>(r.models, []);
  const supports = (r: RelayRow) => modelList(r).length === 0 || modelList(r).includes(model);

  const tiers: RelayRow[][] = [
    usable.filter(supports),
    all.filter(supports).filter((r) => !usable.includes(r)),
    usable.filter((r) => !supports(r)),
    all.filter((r) => !supports(r)),
  ];

  const seen = new Set<string>();
  const out: RelayChoice[] = [];
  for (const tier of tiers) {
    for (const r of tier) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      try {
        out.push({ relay: r, apiKey: decryptSecret(r.api_key_enc), models: modelList(r) });
      } catch {
        // 解密失败视为不可用，跳过
      }
    }
  }
  return out;
}

export function markRelayState(relayId: string, state: string, cooldownMs = 0) {
  run(
    "UPDATE relays SET health_state = ?, cooldown_until = ?, updated_at = ? WHERE id = ?",
    state,
    cooldownMs > 0 ? new Date(Date.now() + cooldownMs).toISOString() : null,
    now(),
    relayId,
  );
}

export interface UsageRow {
  id: string;
  relay_id: string | null;
  token_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  status_code: number | null;
  created_at: string;
}

export function recordUsage(u: {
  relayId?: string | null;
  tokenId?: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
  statusCode?: number;
}) {
  const cost = computeCost(u.model, u.promptTokens, u.completionTokens);
  const id = uid("u_");
  run(
    "INSERT INTO relay_usage(id, relay_id, token_id, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, status_code, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id,
    u.relayId ?? null,
    u.tokenId ?? null,
    u.model,
    u.promptTokens,
    u.completionTokens,
    cost,
    u.latencyMs ?? null,
    u.statusCode ?? null,
    now(),
  );
  if (u.tokenId) {
    run("UPDATE relay_tokens SET used_usd = used_usd + ? WHERE id = ?", cost, u.tokenId);
  }
  return { id, cost };
}

export interface RelayTokenRow {
  id: string;
  name: string;
  token_hash: string;
  allowed_models: string;
  budget_usd: number | null;
  used_usd: number;
  expires_at: string | null;
  enabled: number;
  created_at: string;
}

export function findRelayToken(raw: string): RelayTokenRow | undefined {
  return one<RelayTokenRow>("SELECT * FROM relay_tokens WHERE token_hash = ?", hashKey(raw));
}

export function tokenAllowed(t: RelayTokenRow, model: string): boolean {
  if (!t.enabled) return false;
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return false;
  if (t.budget_usd != null && t.used_usd >= t.budget_usd) return false;
  const allowed = json<string[]>(t.allowed_models, []);
  if (allowed.length > 0 && !allowed.includes(model)) return false;
  return true;
}
