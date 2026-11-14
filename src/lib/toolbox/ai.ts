/** AI 增强 / 其他工具引擎。
 *
 * 需要外部 API Key 的能力明确返回 ok:false，绝不伪造结果。
 */

import { createHash } from "node:crypto";
import { okResult, errResult, str, num, bool, type ToolEngineExt, type ToolResult } from "./types";

function textResult(text: string, filename = "result.txt"): ToolResult {
  return okResult({ text, chars: text.length }, "text/plain", filename);
}

const NEEDS_KEY = "需要配置 API Key：请在系统设置中配置对应的 API Key 后再使用该功能。本引擎不会在没有有效 Key 的情况下返回伪造结果。";

export const aiEnhanceImage: ToolEngineExt = {
  name: "ai.enhance_image",
  category: "ai",
  description: "AI 图片增强 / 超分（需要外部 API Key）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "apiKey", label: "API Key", type: "text", required: true },
    { name: "scale", label: "放大倍数", type: "number", default: 2 },
  ],
  async run(input): Promise<ToolResult> {
    const key = str(input, "apiKey").trim();
    if (!key) return errResult(NEEDS_KEY);
    return errResult(
      "AI 图片增强服务尚未接入具体后端：需要你配置一个支持图像超分的 API 服务与端点。当前实现不返回伪造结果。",
    );
  },
};

export const aiRemoveBackground: ToolEngineExt = {
  name: "ai.remove_background",
  category: "ai",
  description: "AI 抠图（需要外部 API Key）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "apiKey", label: "API Key", type: "text", required: true },
  ],
  async run(input): Promise<ToolResult> {
    const key = str(input, "apiKey").trim();
    if (!key) return errResult(NEEDS_KEY);
    return errResult(
      "AI 抠图服务尚未接入具体后端：请配置支持人像/主体分割的 API 服务与端点。当前实现不返回伪造结果。",
    );
  },
};

export const aiPromptHelper: ToolEngineExt = {
  name: "ai.prompt_helper",
  category: "ai",
  description: "提示词结构化助手（纯本地模板组装，不调用外部模型）。",
  fields: [
    { name: "goal", label: "目标", type: "textarea", required: true },
    { name: "role", label: "角色设定", type: "text", default: "资深领域专家" },
    { name: "constraints", label: "约束条件", type: "textarea" },
    { name: "outputFormat", label: "输出格式要求", type: "textarea" },
    { name: "examples", label: "示例（可选）", type: "textarea" },
  ],
  async run(input): Promise<ToolResult> {
    const goal = str(input, "goal").trim();
    if (!goal) return errResult("请输入目标");
    const parts = [
      `# 角色\n你是一名${str(input, "role", "资深领域专家")}。`,
      `# 目标\n${goal}`,
    ];
    const constraints = str(input, "constraints").trim();
    if (constraints) parts.push(`# 约束条件\n${constraints}`);
    const fmt = str(input, "outputFormat").trim();
    if (fmt) parts.push(`# 输出格式\n${fmt}`);
    const examples = str(input, "examples").trim();
    if (examples) parts.push(`# 示例\n${examples}`);
    parts.push("# 要求\n先复述你的理解，再给出最终答案。");
    return textResult(parts.join("\n\n"), "prompt.md");
  },
};

/* ---------------- 其他工具 ---------------- */

export const passwordGenerate: ToolEngineExt = {
  name: "misc.password",
  category: "misc",
  description: "生成强密码（含大小写、数字、符号）。",
  fields: [
    { name: "length", label: "长度", type: "number", default: 20 },
    { name: "symbols", label: "包含符号", type: "boolean", default: true },
    { name: "count", label: "生成个数", type: "number", default: 1 },
  ],
  async run(input): Promise<ToolResult> {
    const length = Math.max(4, Math.min(256, num(input, "length", 20)));
    const count = Math.max(1, Math.min(100, num(input, "count", 1)));
    const symbols = bool(input, "symbols", true);
    let pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    if (symbols) pool += "!@#$%^&*()-_=+[]{}<>?/";
    const list: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const bytes = new Uint8Array(length);
      for (let j = 0; j < length; j += 1) {
        bytes[j] = pool.charCodeAt(crypto.getRandomValues(new Uint32Array(1))[0]! % pool.length);
      }
      list.push(Buffer.from(bytes).toString("latin1"));
    }
    return okResult({ passwords: list, length }, "text/plain", "passwords.txt");
  },
};

export const colorConvert: ToolEngineExt = {
  name: "misc.color_convert",
  category: "misc",
  description: "颜色格式转换（HEX / RGB / HSL）。",
  fields: [{ name: "input", label: "颜色（#RRGGBB 或 rgb(r,g,b)）", type: "text", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      let r = 0;
      let g = 0;
      let b = 0;
      const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
      if (hex) {
        const h = hex[1]!;
        const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
        r = parseInt(full.slice(0, 2), 16);
        g = parseInt(full.slice(2, 4), 16);
        b = parseInt(full.slice(4, 6), 16);
      } else {
        const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw);
        if (!rgb) return errResult("无法识别颜色格式，请使用 #RRGGBB 或 rgb(r,g,b)");
        r = Number(rgb[1]);
        g = Number(rgb[2]);
        b = Number(rgb[3]);
      }
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      let h = 0;
      let s = 0;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r / 255) h = ((g / 255 - b / 255) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g / 255) h = ((b / 255 - r / 255) / d + 2) * 60;
        else h = ((r / 255 - g / 255) / d + 4) * 60;
      }
      const hexOut = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      return okResult({
        hex: hexOut,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
        components: { r, g, b },
      });
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const checksumFile: ToolEngineExt = {
  name: "misc.checksum",
  category: "misc",
  description: "计算文件校验和（MD5 / SHA-256）。",
  fields: [
    { name: "file", label: "文件", type: "file", required: true },
    { name: "algorithm", label: "算法", type: "select", default: "sha256", options: [
      { value: "md5", label: "MD5" },
      { value: "sha256", label: "SHA-256" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "file");
      const comma = raw.indexOf(",");
      const payload = raw.startsWith("data:") && comma > 0 ? raw.slice(comma + 1) : raw;
      const buf = Buffer.from(payload.replace(/\s+/g, ""), "base64");
      const algorithm = str(input, "algorithm", "sha256");
      const hash = createHash(algorithm).update(buf).digest("hex");
      return okResult({ hash, algorithm, bytes: buf.length });
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const stringStats: ToolEngineExt = {
  name: "misc.string_stats",
  category: "misc",
  description: "文本统计（字符、词、行、字节、出现频率）。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "top", label: "高频词数量", type: "number", default: 10 },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const chars = [...raw].length;
    const lines = raw ? raw.split(/\r?\n/).length : 0;
    const words = raw.split(/\s+/).filter(Boolean).length;
    const cjk = (raw.match(/[一-龥]/g) ?? []).length;
    const top = Math.max(0, Math.min(100, num(input, "top", 10)));
    const freq = new Map<string, number>();
    for (const w of raw.split(/\s+/).filter(Boolean)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([w, c]) => ({ word: w, count: c }));
    return okResult({
      chars,
      charsNoSpace: [...raw.replace(/\s/g, "")].length,
      bytes: Buffer.byteLength(raw, "utf8"),
      lines,
      words,
      cjkChars: cjk,
      topWords,
    });
  },
};

export const aiEngines: ToolEngineExt[] = [aiEnhanceImage, aiRemoveBackground, aiPromptHelper];

export const miscEngines: ToolEngineExt[] = [
  passwordGenerate,
  colorConvert,
  checksumFile,
  stringStats,
];
