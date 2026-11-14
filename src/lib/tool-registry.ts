/**
 * 工具引擎注册表（桥接层）。
 * 实际实现在 src/lib/toolbox/registry.ts（由工具箱模块负责）。
 * 若该模块尚未就绪，此处回退为空注册表，不影响其他功能。
 */

export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  mime?: string;
  filename?: string;
}

export interface ToolField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "file" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: unknown;
}

export interface ToolEngine {
  name: string;
  category: string;
  description: string;
  fields?: ToolField[];
  run(input: Record<string, unknown>): Promise<ToolResult>;
}

let cached: ToolEngine[] | null = null;

export async function loadToolEngines(): Promise<ToolEngine[]> {
  if (cached) return cached;
  try {
    const mod = await import("./toolbox/registry");
    cached = (mod.TOOL_ENGINES ?? []) as ToolEngine[];
  } catch {
    cached = [];
  }
  return cached;
}

export async function getToolEngine(name: string): Promise<ToolEngine | undefined> {
  const all = await loadToolEngines();
  return all.find((e) => e.name === name);
}

export { loadToolEngines as TOOL_ENGINES_PROMISE };
