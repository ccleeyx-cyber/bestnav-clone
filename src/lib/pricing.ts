/**
 * 模型价格表（USD / 1M tokens）。来自公开的 LiteLLM / OpenRouter 价格数据快照。
 * 可在设置里覆盖单价（覆盖值存 settings 表 key='relay.pricing'）。
 */
export interface ModelPrice {
  input: number;
  output: number;
}

const BASE: Record<string, ModelPrice> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "qwen-plus": { input: 0.4, output: 1.2 },
  "qwen-turbo": { input: 0.1, output: 0.3 },
  "glm-4-flash": { input: 0.1, output: 0.1 },
  "glm-4-plus": { input: 1, output: 1 },
  "moonshot-v1-8k": { input: 0.2, output: 2 },
  "llama-3.3-70b": { input: 0.59, output: 0.79 },
  "mistral-large": { input: 2, output: 6 },
};

let overrides: Record<string, ModelPrice> = {};

export function setPriceOverrides(o: Record<string, ModelPrice>) {
  overrides = o ?? {};
}

export function getOverrides() {
  return overrides;
}

function baseFor(model: string): ModelPrice {
  const m = model.toLowerCase();
  for (const [k, v] of Object.entries(BASE)) {
    if (m.includes(k)) return v;
  }
  return { input: 0.5, output: 1.5 };
}

export function priceOf(model: string): ModelPrice {
  if (overrides[model]) return overrides[model];
  return baseFor(model);
}

export function computeCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = priceOf(model);
  return (promptTokens / 1e6) * p.input + (completionTokens / 1e6) * p.output;
}
