/** 开发者工具引擎：UUID / 哈希 / 换行 / CSV / Markdown / SQL / diff。 */

import { createHash, randomUUID } from "node:crypto";
import { okResult, errResult, str, num, bool, type ToolEngineExt, type ToolResult } from "./types";

function textResult(text: string, filename = "result.txt"): ToolResult {
  return okResult({ text, chars: text.length }, "text/plain", filename);
}

export const uuidGenerate: ToolEngineExt = {
  name: "dev.uuid",
  category: "dev",
  description: "生成 UUID（v4 随机 / v7 时间有序）。",
  fields: [
    { name: "count", label: "生成数量", type: "number", default: 1 },
    { name: "version", label: "版本", type: "select", default: "v4", options: [
      { value: "v4", label: "v4（随机）" },
      { value: "v7", label: "v7（时间有序）" },
    ] },
    { name: "uppercase", label: "大写输出", type: "boolean" },
  ],
  async run(input): Promise<ToolResult> {
    const count = Math.max(1, Math.min(1000, num(input, "count", 1)));
    const version = str(input, "version", "v4");
    const upper = bool(input, "uppercase", false);
    const list: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (version === "v7") {
        // 手工实现 UUIDv7：48 位毫秒时间戳 + 版本/变体 + 随机
        const ts = BigInt(Date.now());
        const rand = randomUUID().replace(/-/g, "");
        const timeHex = ts.toString(16).padStart(12, "0").slice(-12);
        const variant = "89ab"[parseInt(rand.slice(16, 17), 16) % 4]!;
        const uuid = `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${timeHex.slice(12, 15)}-${variant}${rand.slice(17, 20)}-${rand.slice(20, 32)}`;
        list.push(upper ? uuid.toUpperCase() : uuid);
      } else {
        const uuid = randomUUID();
        list.push(upper ? uuid.toUpperCase() : uuid);
      }
    }
    return textResult(list.join("\n"), "uuid.txt");
  },
};

export const hashText: ToolEngineExt = {
  name: "dev.hash",
  category: "dev",
  description: "计算文本哈希（MD5 / SHA1 / SHA256 / SHA512）。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "algorithm", label: "算法", type: "select", default: "sha256", options: [
      { value: "md5", label: "MD5" },
      { value: "sha1", label: "SHA-1" },
      { value: "sha256", label: "SHA-256" },
      { value: "sha512", label: "SHA-512" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const algorithm = str(input, "algorithm", "sha256");
    const hash = createHash(algorithm).update(raw, "utf8").digest("hex");
    return okResult({ hash, algorithm, bytes: Buffer.byteLength(raw, "utf8") });
  },
};

export const newlineConvert: ToolEngineExt = {
  name: "dev.newline_convert",
  category: "dev",
  description: "CRLF ↔ LF 换行转换。",
  fields: [
    { name: "input", label: "文本", type: "textarea", required: true },
    { name: "mode", label: "目标换行", type: "select", default: "lf", options: [
      { value: "lf", label: "LF（Unix）" },
      { value: "crlf", label: "CRLF（Windows）" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const mode = str(input, "mode", "lf");
    const normalized = raw.replace(/\r\n/g, "\n");
    const out = mode === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
    return okResult({
      text: out,
      crlfCount: (out.match(/\r\n/g) ?? []).length,
      lfCount: (out.match(/(?<!\r)\n/g) ?? []).length,
    }, "text/plain", "newlines.txt");
  },
};

/* ---------- CSV 解析（手写，支持引号转义） ---------- */

export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const delim = delimiter;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = cell ?? "";
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export const csvToJson: ToolEngineExt = {
  name: "dev.csv_to_json",
  category: "dev",
  description: "CSV 转 JSON。",
  fields: [
    { name: "input", label: "CSV 内容", type: "textarea", required: true },
    { name: "delimiter", label: "分隔符", type: "text", default: "," },
    { name: "header", label: "首行为表头", type: "boolean", default: true },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input");
      if (!raw.trim()) return errResult("请输入 CSV 内容");
      const delimiter = str(input, "delimiter", ",") || ",";
      const rows = parseCsv(raw, delimiter);
      if (!rows.length) return errResult("CSV 解析结果为空");
      let obj: unknown;
      if (bool(input, "header", true)) {
        const header = rows[0]!;
        obj = rows.slice(1).map((r) => {
          const rec: Record<string, string> = {};
          header.forEach((h, i) => {
            rec[h] = r[i] ?? "";
          });
          return rec;
        });
      } else {
        obj = rows;
      }
      return okResult({ json: JSON.stringify(obj, null, 2), rows: rows.length }, "application/json", "data.json");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const jsonToCsv: ToolEngineExt = {
  name: "dev.json_to_csv",
  category: "dev",
  description: "JSON 转 CSV（对象数组）。",
  fields: [
    { name: "input", label: "JSON", type: "textarea", required: true },
    { name: "delimiter", label: "分隔符", type: "text", default: "," },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      if (!raw) return errResult("请输入 JSON 内容");
      const parsed = JSON.parse(raw);
      const delimiter = str(input, "delimiter", ",") || ",";
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (!arr.length) return errResult("JSON 数组为空");
      const keys = [...new Set(arr.flatMap((o) => (o && typeof o === "object" ? Object.keys(o as object) : [])))];
      if (!keys.length) return errResult("无法从 JSON 中提取字段（需要对象数组）");
      const rows: string[][] = [keys];
      for (const o of arr) {
        const rec = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
        rows.push(keys.map((k) => (rec[k] === undefined || rec[k] === null ? "" : String(rec[k]))));
      }
      return okResult({ csv: toCsv(rows).replace(/,/g, delimiter), rows: rows.length - 1 }, "text/csv", "data.csv");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const markdownToHtml: ToolEngineExt = {
  name: "dev.markdown_to_html",
  category: "dev",
  description: "Markdown 转 HTML（轻量实现，支持标题/列表/粗斜体/代码/链接/引用）。",
  fields: [{ name: "input", label: "Markdown", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const md = str(input, "input");
    const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = escaped.split(/\r?\n/);
    const out: string[] = [];
    let inList = false;
    let inCode = false;
    for (const rawLine of lines) {
      if (rawLine.trim().startsWith("```")) {
        if (inCode) {
          out.push("</code></pre>");
          inCode = false;
        } else {
          out.push("<pre><code>");
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        out.push(rawLine);
        continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(rawLine);
      if (heading) {
        if (inList) { out.push("</ul>"); inList = false; }
        const level = heading[1]!.length;
        out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
        continue;
      }
      const listItem = /^[-*+]\s+(.*)$/.exec(rawLine);
      if (listItem) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push(`<li>${inline(listItem[1]!)}</li>`);
        continue;
      }
      if (inList) { out.push("</ul>"); inList = false; }
      if (!rawLine.trim()) { out.push(""); continue; }
      const quote = /^&gt;\s?(.*)$/.exec(rawLine);
      if (quote) { out.push(`<blockquote>${inline(quote[1]!)}</blockquote>`); continue; }
      out.push(`<p>${inline(rawLine)}</p>`);
    }
    if (inList) out.push("</ul>");
    if (inCode) out.push("</code></pre>");
    const html = out.join("\n");
    return okResult({ html, chars: html.length }, "text/html", "output.html");
  },
};

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export const htmlToMarkdown: ToolEngineExt = {
  name: "dev.html_to_markdown",
  category: "dev",
  description: "HTML 转 Markdown（轻量实现）。",
  fields: [{ name: "input", label: "HTML", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const html = str(input, "input");
    let md = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl: string, t: string) => {
        const n = Number(lvl);
        return `\n${"#".repeat(n)} ${strip(t)}\n`;
      })
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t: string) => `\n- ${strip(t)}`)
      .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __: string, t: string) => `**${strip(t)}**`)
      .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __: string, t: string) => `*${strip(t)}*`)
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t: string) => `\`${strip(t)}\``)
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, t: string) => `[${strip(t)}](${href})`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return okResult({ markdown: md, chars: md.length }, "text/markdown", "output.md");
  },
};

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export const sqlFormat: ToolEngineExt = {
  name: "dev.sql_format",
  category: "dev",
  description: "SQL 格式化（关键字大写、缩进、拆分语句）。",
  fields: [{ name: "input", label: "SQL", type: "textarea", required: true }],
  async run(input): Promise<ToolResult> {
    const raw = str(input, "input");
    const keywords =
      /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|JOIN|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ON|AS|AND|OR|NOT|NULL|PRIMARY KEY|FOREIGN KEY|REFERENCES|UNIQUE|DEFAULT|CASE|WHEN|THEN|ELSE|END|LIMIT|OFFSET|DISTINCT|UNION ALL|UNION|WITH|BEGIN|COMMIT|ROLLBACK|INNER|EXISTS|IN|BETWEEN|LIKE|IS)\b/g;
    let sql = raw.replace(/\s+/g, " ").trim();
    sql = sql.replace(keywords, (m) => m.toUpperCase());
    sql = sql.replace(/\s*,\s*/g, ", ");
    sql = sql.replace(/\bSELECT\b/gi, "SELECT\n  ");
    sql = sql.replace(/\bFROM\b/gi, "\nFROM ");
    sql = sql.replace(/\bWHERE\b/gi, "\nWHERE ");
    sql = sql.replace(/\bGROUP BY\b/gi, "\nGROUP BY ");
    sql = sql.replace(/\bORDER BY\b/gi, "\nORDER BY ");
    sql = sql.replace(/\bHAVING\b/gi, "\nHAVING ");
    sql = sql.replace(/\bLIMIT\b/gi, "\nLIMIT ");
    sql = sql.replace(/\bJOIN\b/gi, "\nJOIN ");
    sql = sql.replace(/\bON\b/gi, "\n  ON ");
    sql = sql.replace(/\bSET\b/gi, "\nSET ");
    sql = sql.replace(/\bVALUES\b/gi, "\nVALUES ");
    sql = sql.replace(/\bAND\b/gi, "\n  AND ");
    sql = sql.replace(/\bOR\b/gi, "\n  OR ");
    sql = sql.replace(/;\s*$/, ";");
    const formatted = sql
      .split(/;\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${s};`)
      .join("\n\n");
    return okResult({ sql: formatted, chars: formatted.length }, "text/plain", "formatted.sql");
  },
};

export const diffText: ToolEngineExt = {
  name: "dev.diff",
  category: "dev",
  description: "文本对比（行级 diff，输出增删标记）。",
  fields: [
    { name: "left", label: "原文 A", type: "textarea", required: true },
    { name: "right", label: "对比文本 B", type: "textarea", required: true },
    { name: "context", label: "上下文行数", type: "number", default: 3 },
  ],
  async run(input): Promise<ToolResult> {
    const a = str(input, "left").split(/\r?\n/);
    const b = str(input, "right").split(/\r?\n/);
    const lines: string[] = [];
    const setA = new Set(a);
    const setB = new Set(b);
    const max = Math.max(a.length, b.length);
    let added = 0;
    let removed = 0;
    for (let i = 0; i < max; i += 1) {
      const la = a[i];
      const lb = b[i];
      if (la === lb) {
        lines.push(`  ${la ?? ""}`);
        continue;
      }
      if (la !== undefined && !setB.has(la)) {
        lines.push(`- ${la}`);
        removed += 1;
      }
      if (lb !== undefined && !setA.has(lb)) {
        lines.push(`+ ${lb}`);
        added += 1;
      }
      if (la !== undefined && lb !== undefined && setB.has(la) && setA.has(lb)) {
        lines.push(`- ${la}`);
        lines.push(`+ ${lb}`);
        removed += 1;
        added += 1;
      }
    }
    const diff = lines.join("\n");
    return okResult({ diff, added, removed, changed: added + removed > 0 }, "text/plain", "diff.txt");
  },
};

export const devEngines: ToolEngineExt[] = [
  uuidGenerate,
  hashText,
  newlineConvert,
  csvToJson,
  jsonToCsv,
  markdownToHtml,
  htmlToMarkdown,
  sqlFormat,
  diffText,
];
