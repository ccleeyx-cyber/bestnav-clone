/**
 * 工具引擎注册表（lead 约定的桥接入口）。
 *
 * 约定：必须导出 TOOL_ENGINES: ToolEngine[]
 * 每个元素含 name / category / description / fields? / run(input)
 *
 * 字段类型沿用 @/lib/tool-registry 的 ToolField：
 * text | textarea | number | boolean | file | select
 *
 * 文件类输入：引擎优先读取自身 file 字段（data URL 或纯 base64），
 * 缺失时回退到通用 input.base64（开放 API 网关约定）。
 * 返回值带 mime / filename，页面负责转 blob 下载。
 */

import type { ToolEngine } from "@/lib/tool-registry";
import type { ToolEngineExt } from "./types";
import { pdfEngines } from "./pdf";
import { imageEngines } from "./image";
import { ocrEngines } from "./ocr";
import { textEngines } from "./text";
import { devEngines } from "./dev";
import { formatEngines, formatPadNumber } from "./format";
import { aiEngines, miscEngines } from "./ai";

/** 全部引擎（内部宽松类型）。 */
export const ALL_ENGINE_LIST: ToolEngineExt[] = [
  ...pdfEngines,
  ...imageEngines,
  ...ocrEngines,
  ...textEngines,
  ...devEngines,
  ...formatEngines,
  formatPadNumber,
  ...aiEngines,
  ...miscEngines,
];

/** 对外注册表：lead 的开放 API 网关 / MCP 直接消费这个数组。 */
export const TOOL_ENGINES: ToolEngine[] = ALL_ENGINE_LIST.map((e) => ({
  name: e.name,
  category: e.category,
  description: e.description,
  fields: e.fields?.map((f) => ({ ...f })),
  run: (input: Record<string, unknown>) => e.run(input),
}));

const ENGINE_MAP = new Map(TOOL_ENGINES.map((e) => [e.name, e]));

export function getEngine(name: string): ToolEngine | undefined {
  return ENGINE_MAP.get(name);
}

export function listEngines(): {
  name: string;
  category: string;
  description: string;
  fields?: ToolEngine["fields"];
}[] {
  return TOOL_ENGINES.map((e) => ({
    name: e.name,
    category: e.category,
    description: e.description,
    fields: e.fields,
  }));
}

export function enginesByCategory(): Record<string, ToolEngine[]> {
  const out: Record<string, ToolEngine[]> = {};
  for (const e of TOOL_ENGINES) {
    if (!out[e.category]) out[e.category] = [];
    out[e.category]!.push(e);
  }
  return out;
}

export { TOOL_CATEGORIES } from "./types";
export type { ToolEngine, ToolResult, ToolField } from "./types";
