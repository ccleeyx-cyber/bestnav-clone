/** 效率工具箱 —— 类型与通用辅助。
 *
 * 类型定义以 @/lib/tool-registry 为准（lead 维护），此处仅做 re-export 与工具函数。
 */

import type { ToolEngine, ToolField, ToolResult } from "@/lib/tool-registry";

export type { ToolEngine, ToolField, ToolResult };

export type ToolFieldType = ToolField["type"];

/** 扩展字段：附加 multiple（多文件）与 help（提示）说明。 */
export type ToolFieldExt = ToolField & {
  multiple?: boolean;
  help?: string;
};

/** 本模块内部使用的引擎类型（fields 更宽松，导出时向上兼容 ToolEngine）。 */
export type ToolEngineExt = Omit<ToolEngine, "fields"> & { fields?: ToolFieldExt[] };

export const TOOL_CATEGORIES = [
  { id: "pdf", label: "PDF 处理", icon: "📕" },
  { id: "image", label: "图片处理", icon: "🖼️" },
  { id: "ocr", label: "OCR 识别", icon: "🔤" },
  { id: "text", label: "文本转换", icon: "🔄" },
  { id: "dev", label: "开发者工具", icon: "🧑‍💻" },
  { id: "format", label: "格式转换", icon: "📊" },
  { id: "ai", label: "AI 增强", icon: "🤖" },
  { id: "misc", label: "其他工具", icon: "🧰" },
] as const;

export type ToolCategoryId = (typeof TOOL_CATEGORIES)[number]["id"];

/* ---------- 通用输入辅助 ---------- */

export function str(input: Record<string, unknown>, key: string, fallback = ""): string {
  const v = input[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

export function num(input: Record<string, unknown>, key: string, fallback: number): number {
  const v = input[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function bool(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = input[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return fallback;
}

/**
 * 从 data URL 或纯 base64 解析出 Buffer。
 * 优先取指定 key；若该 key 为空，回退到通用 input.base64（开放 API 网关约定）。
 */
export function toBuffer(input: Record<string, unknown>, key = "base64"): Buffer {
  const raw = str(input, key) || str(input, "base64");
  if (!raw) throw new Error("缺少文件输入");
  const comma = raw.indexOf(",");
  const payload = raw.startsWith("data:") && comma > 0 ? raw.slice(comma + 1) : raw;
  const clean = payload.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]*$/.test(clean)) throw new Error("文件内容不是合法的 base64");
  return Buffer.from(clean, "base64");
}

/** 拆分多文件（data URL 以换行分隔）。优先指定 key，回退到 input.base64。 */
export function splitFiles(input: Record<string, unknown>, key: string): string[] {
  const raw = str(input, key) || str(input, "base64");
  if (!raw) return [];
  return raw
    .split(/\n(?=data:)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function dataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function okResult(output: unknown, mime?: string, filename?: string): ToolResult {
  return { ok: true, output, mime, filename };
}

export function errResult(message: string): ToolResult {
  return { ok: false, error: message };
}
