/** 文本转换引擎。 */

import {
  okResult,
  errResult,
  str,
  num,
  bool,
  type ToolEngineExt,
  type ToolResult,
} from "./types";

function textResult(text: string, filename = "result.txt"): ToolResult {
  return okResult({ text, chars: text.length, lines: text ? text.split("\n").length : 0 }, "text/plain", filename);
}

export const jsonFormat: ToolEngineExt = {
  name: "text.json_format",
  category: "text",
  description: "JSON 格式化（缩进美化）。",
  fields: [
    { name: "input", label: "JSON", type: "textarea", required: true },
    { name: "indent", label: "缩进", type: "select", default: "2", options: [
      { value: "2", label: "2 空格" },
      { value: "4", label: "4 空格" },
      { value: "tab", label: "Tab" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      if (!raw) return errResult("请输入 JSON 内容");
      const indentRaw = str(input, "indent", "2");
      const indent = indentRaw === "tab" ? "\t" : Number(indentRaw) || 2;
      const parsed = JSON.parse(raw);
      return textResult(JSON.stringify(parsed, null, indent), "formatted.json");
    } catch (err) {
      return errResult(`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const jsonMinify: ToolEngineExt = {
  name: "text.json_minify",
  category: "text",
  description: "JSON 压缩（去空白）。",
  fields: [{ name: "input", label: "JSON", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      if (!raw) return errResult("请输入 JSON 内容");
      const parsed = JSON.parse(raw);
      return textResult(JSON.stringify(parsed), "minified.json");
    } catch (err) {
      return errResult(`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const jsonValidate: ToolEngineExt = {
  name: "text.json_validate",
  category: "text",
  description: "校验 JSON 是否合法。",
  fields: [{ name: "input", label: "JSON", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input").trim();
    if (!raw) return errResult("请输入 JSON 内容");
    try {
      const parsed = JSON.parse(raw);
      const type = Array.isArray(parsed) ? "array" : typeof parsed;
      const keys =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.keys(parsed)
          : [];
      return okResult({ valid: true, type, topLevelKeys: keys, sizeBytes: raw.length });
    } catch (err) {
      return okResult({
        valid: false,
        error: err instanceof Error ? err.message : String(err),
        sizeBytes: raw.length,
      });
    }
  },
};

export const base64Encode: ToolEngineExt = {
  name: "text.base64_encode",
  category: "text",
  description: "文本转 Base64（支持 UTF-8）。",
  fields: [{ name: "input", label: "文本", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    if (!raw) return errResult("请输入文本");
    return textResult(Buffer.from(raw, "utf8").toString("base64"), "encoded.txt");
  },
};

export const base64Decode: ToolEngineExt = {
  name: "text.base64_decode",
  category: "text",
  description: "Base64 转文本（自动尝试 UTF-8 解码）。",
  fields: [{ name: "input", label: "Base64", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").replace(/\s+/g, "");
      if (!raw) return errResult("请输入 Base64 内容");
      const buf = Buffer.from(raw, "base64");
      const decoded = buf.toString("utf8");
      return okResult(
        { text: decoded, bytes: buf.length, binary: decoded.includes("�") },
        "text/plain",
        "decoded.txt",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const urlEncode: ToolEngineExt = {
  name: "text.url_encode",
  category: "text",
  description: "URL 编码（encodeURIComponent）。",
  fields: [{ name: "input", label: "文本", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    if (!raw) return errResult("请输入文本");
    return textResult(encodeURIComponent(raw), "url-encoded.txt");
  },
};

export const urlDecode: ToolEngineExt = {
  name: "text.url_decode",
  category: "text",
  description: "URL 解码。",
  fields: [{ name: "input", label: "URL 编码文本", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input");
      if (!raw) return errResult("请输入内容");
      return textResult(decodeURIComponent(raw.replace(/\+/g, " ")), "url-decoded.txt");
    } catch (err) {
      return errResult(`URL 解码失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const timestampConvert: ToolEngineExt = {
  name: "text.timestamp_convert",
  category: "text",
  description: "时间戳转换（Unix 秒/毫秒 ↔ 本地时间 ↔ ISO 8601）。",
  fields: [
    { name: "input", label: "时间戳或时间字符串", type: "text", required: true },
    { name: "unit", label: "输入单位", type: "select", default: "auto", options: [
      { value: "auto", label: "自动识别" },
      { value: "s", label: "秒" },
      { value: "ms", label: "毫秒" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      if (!raw) return errResult("请输入时间戳或时间字符串");
      let ms: number | null = null;
      if (/^\d+$/.test(raw)) {
        const n = Number(raw);
        const unit = str(input, "unit", "auto");
        const asMs = unit === "s" ? n * 1000 : unit === "ms" ? n : n < 1e11 ? n * 1000 : n;
        ms = asMs;
      } else {
        const d = new Date(raw);
        ms = Number.isNaN(d.getTime()) ? null : d.getTime();
      }
      if (ms === null) return errResult("无法解析该时间");
      const d = new Date(ms);
      return okResult({
        input: raw,
        epochSeconds: Math.floor(ms / 1000),
        epochMilliseconds: ms,
        iso: d.toISOString(),
        utc: d.toUTCString(),
        local: d.toString(),
        localISO: d.toISOString(),
      });
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const baseConvert: ToolEngineExt = {
  name: "text.base_convert",
  category: "text",
  description: "进制转换（2-36 进制之间）。",
  fields: [
    { name: "input", label: "数字", type: "text", required: true },
    { name: "from", label: "源进制", type: "number", default: 10 },
    { name: "to", label: "目标进制", type: "number", default: 16 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      const from = Math.max(2, Math.min(36, num(input, "from", 10)));
      const to = Math.max(2, Math.min(36, num(input, "to", 16)));
      if (!raw) return errResult("请输入数字");
      const value = BigInt(`0${raw.replace(/^\+/, "")}`);
      const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
      let n = value;
      if (n === 0n) {
        return okResult({ value: "0", from, to, decimal: "0" });
      }
      let out = "";
      const neg = n < 0n;
      if (neg) n = -n;
      while (n > 0n) {
        out = digits[Number(n % BigInt(to))] + out;
        n /= BigInt(to);
      }
      if (neg) out = "-" + out;
      return okResult({
        value: out,
        from,
        to,
        decimal: value.toString(10),
        binary: value.toString(2),
        octal: value.toString(8),
        hex: value.toString(16),
      });
    } catch (err) {
      return errResult(`进制转换失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const randomString: ToolEngineExt = {
  name: "text.random_string",
  category: "text",
  description: "生成随机字符串（支持大小写、数字、符号）。",
  fields: [
    { name: "length", label: "长度", type: "number", default: 16 },
    { name: "uppercase", label: "包含大写字母", type: "boolean", default: true },
    { name: "lowercase", label: "包含小写字母", type: "boolean", default: true },
    { name: "digits", label: "包含数字", type: "boolean", default: true },
    { name: "symbols", label: "包含符号", type: "boolean" },
  ],
  async run(input): Promise<ToolResult> {
    const length = Math.max(1, Math.min(4096, num(input, "length", 16)));
    let pool = "";
    if (bool(input, "uppercase", true)) pool += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (bool(input, "lowercase", true)) pool += "abcdefghijklmnopqrstuvwxyz";
    if (bool(input, "digits", true)) pool += "0123456789";
    if (bool(input, "symbols", false)) pool += "!@#$%^&*()-_=+[]{}<>?/";
    if (!pool) return errResult("请至少启用一种字符类型");
    const bytes = new Uint8Array(length);
    const rand = new Uint32Array(length);
    for (let i = 0; i < length; i += 1) {
      rand[i] = crypto.getRandomValues(new Uint32Array(1))[0]!;
    }
    for (let i = 0; i < length; i += 1) {
      bytes[i] = pool.charCodeAt(rand[i]! % pool.length);
    }
    return textResult(Buffer.from(bytes).toString("latin1").replace(/[^\x20-\x7e]/g, "x"), "random.txt");
  },
};

export const textDedup: ToolEngineExt = {
  name: "text.dedup",
  category: "text",
  description: "文本去重（逐行）。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "ignoreCase", label: "忽略大小写", type: "boolean" },
    { name: "trim", label: "去除首尾空白", type: "boolean", default: true },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const ignoreCase = bool(input, "ignoreCase", false);
    const trim = bool(input, "trim", true);
    const lines = raw.split(/\r?\n/);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      const key = (trim ? line.trim() : line).toLowerCase();
      const k = ignoreCase ? key : (trim ? line.trim() : line);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(line);
    }
    return textResult(out.join("\n"), "deduped.txt");
  },
};

export const textSort: ToolEngineExt = {
  name: "text.sort",
  category: "text",
  description: "文本排序（逐行，数字感知）。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "order", label: "排序方向", type: "select", default: "asc", options: [
      { value: "asc", label: "升序" },
      { value: "desc", label: "降序" },
    ] },
    { name: "numeric", label: "按数值排序", type: "boolean" },
    { name: "unique", label: "去重", type: "boolean", default: true },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const numeric = bool(input, "numeric", false);
    const desc = str(input, "order", "asc") === "desc";
    let lines = raw.split(/\r?\n/);
    if (bool(input, "unique", true)) lines = [...new Set(lines)];
    const collator = new Intl.Collator("zh-Hans-CN", { numeric });
    lines = lines.sort((a, b) => (desc ? -collator.compare(a, b) : collator.compare(a, b)));
    return textResult(lines.join("\n"), "sorted.txt");
  },
};

export const textCase: ToolEngineExt = {
  name: "text.case",
  category: "text",
  description: "大小写转换。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "mode", label: "模式", type: "select", default: "upper", options: [
      { value: "upper", label: "全大写" },
      { value: "lower", label: "全小写" },
      { value: "title", label: "首字母大写" },
      { value: "camel", label: "camelCase" },
      { value: "snake", label: "snake_case" },
      { value: "kebab", label: "kebab-case" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const mode = str(input, "mode", "upper");
    const words = raw.split(/(\s+)/);
    let out = raw;
    switch (mode) {
      case "lower": out = raw.toLowerCase(); break;
      case "title": out = raw.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()); break;
      case "camel": {
        const parts = raw.trim().split(/[\s_\-]+/).filter(Boolean);
        out = parts
          .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
          .join("");
        break;
      }
      case "snake": {
        out = raw
          .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
          .replace(/[\s\-]+/g, "_")
          .toLowerCase();
        break;
      }
      case "kebab": {
        out = raw
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .replace(/[\s_]+/g, "-")
          .toLowerCase();
        break;
      }
      default: out = raw.toUpperCase();
    }
    void words;
    return textResult(out, "cased.txt");
  },
};

export const regexReplace: ToolEngineExt = {
  name: "text.regex_replace",
  category: "text",
  description: "正则替换（支持 g/i/m/s 标志）。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "pattern", label: "正则表达式", type: "text", required: true },
    { name: "replacement", label: "替换为", type: "text", default: "" },
    { name: "flags", label: "标志", type: "text", default: "g", placeholder: "gim" },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input");
      const pattern = str(input, "pattern");
      if (!pattern) return errResult("请输入正则表达式");
      const replacement = str(input, "replacement");
      const flags = str(input, "flags", "g").replace(/[^gimsuy]/g, "");
      const re = new RegExp(pattern, flags || "g");
      const out = raw.replace(re, replacement);
      const matches = raw.match(new RegExp(pattern, flags.includes("g") ? flags : flags + "g"))?.length ?? 0;
      return okResult({ text: out, chars: out.length, matches }, "text/plain", "replaced.txt");
    } catch (err) {
      return errResult(`正则错误：${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const textEngines: ToolEngineExt[] = [
  jsonFormat,
  jsonMinify,
  jsonValidate,
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  timestampConvert,
  baseConvert,
  randomString,
  textDedup,
  textSort,
  textCase,
  regexReplace,
];
