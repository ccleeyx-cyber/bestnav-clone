/** 格式转换引擎：CSV / JSON 互转，Excel 仅支持 .csv 内容。 */

import { okResult, errResult, str, num, type ToolEngineExt, type ToolResult } from "./types";
import { parseCsv, toCsv } from "./dev";

export const excelToJson: ToolEngineExt = {
  name: "format.excel_to_json",
  category: "format",
  description: "Excel（.csv 内容）转 JSON。当前实现仅支持 CSV 文本，不支持 .xlsx 二进制格式。",
  fields: [
    { name: "input", label: "CSV 内容（.xlsx 请先另存为 .csv）", type: "textarea", required: true },
    { name: "delimiter", label: "分隔符", type: "text", default: "," },
    { name: "header", label: "首行为表头", type: "boolean", default: true },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input");
      if (!raw.trim()) return errResult("请输入 CSV 内容");
      const rows = parseCsv(raw, str(input, "delimiter", ",") || ",");
      if (!rows.length) return errResult("CSV 解析结果为空");
      const header = rows[0]!;
      const obj = rows.slice(1).map((r) => {
        const rec: Record<string, string> = {};
        header.forEach((h, i) => {
          rec[h] = r[i] ?? "";
        });
        return rec;
      });
      return okResult({ json: JSON.stringify(obj, null, 2), rows: obj.length }, "application/json", "data.json");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const csvToJsonFormat: ToolEngineExt = {
  name: "format.csv_to_json",
  category: "format",
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
      const rows = parseCsv(raw, str(input, "delimiter", ",") || ",");
      if (!rows.length) return errResult("CSV 解析结果为空");
      const hasHeader = str(input, "header", "true") !== "false";
      const out = hasHeader
        ? rows.slice(1).map((r) => {
            const rec: Record<string, string> = {};
            rows[0]!.forEach((h, i) => {
              rec[h] = r[i] ?? "";
            });
            return rec;
          })
        : rows;
      return okResult({ json: JSON.stringify(out, null, 2), rows: out.length }, "application/json", "data.json");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const jsonToCsvFormat: ToolEngineExt = {
  name: "format.json_to_csv",
  category: "format",
  description: "JSON 转 CSV。",
  fields: [
    { name: "input", label: "JSON", type: "textarea", required: true },
    { name: "delimiter", label: "分隔符", type: "text", default: "," },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input").trim();
      if (!raw) return errResult("请输入 JSON 内容");
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (!arr.length) return errResult("JSON 数组为空");
      const keys = [...new Set(arr.flatMap((o) => (o && typeof o === "object" ? Object.keys(o as object) : [])))];
      if (!keys.length) return errResult("无法从 JSON 中提取字段（需要对象数组）");
      const rows: string[][] = [keys];
      for (const o of arr) {
        const rec = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
        rows.push(keys.map((k) => (rec[k] === undefined || rec[k] === null ? "" : String(rec[k]))));
      }
      const delimiter = str(input, "delimiter", ",") || ",";
      const csv = toCsv(rows).replace(/,/g, delimiter);
      return okResult({ csv, rows: rows.length - 1 }, "text/csv", "data.csv");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const jsonToExcel: ToolEngineExt = {
  name: "format.json_to_excel",
  category: "format",
  description: "JSON 转 Excel（以 .csv 形式输出）。当前实现不生成 .xlsx 二进制，请用 .csv 在 Excel 中打开。",
  fields: [
    { name: "input", label: "JSON", type: "textarea", required: true },
    { name: "delimiter", label: "分隔符", type: "text", default: "," },
  ],
  async run(input): Promise<ToolResult> {
    const res = await jsonToCsvFormat.run(input);
    if (!res.ok) return res;
    const payload = res.output as { csv: string };
    return okResult(
      {
        csv: payload.csv,
        note: "已输出 CSV 格式（.csv）。本工具箱不生成 .xlsx 二进制文件，请用 Excel / WPS 打开该 .csv。",
      },
      "text/csv",
      "data.csv",
    );
  },
};

export const formatEngines: ToolEngineExt[] = [
  excelToJson,
  csvToJsonFormat,
  jsonToCsvFormat,
  jsonToExcel,
];

/** 供其它模块复用的列宽计算。 */
export function columnWidths(rows: string[][]): number[] {
  if (!rows.length) return [];
  const cols = Math.max(...rows.map((r) => r.length));
  const widths: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    let max = 0;
    for (const r of rows) max = Math.max(max, (r[c] ?? "").length);
    widths.push(Math.min(40, max + 2));
  }
  return widths;
}

export const formatPadNumber: ToolEngineExt = {
  name: "format.number_pad",
  category: "format",
  description: "数字补零 / 千分位格式化。",
  fields: [
    { name: "input", label: "数字（每行一个或逗号分隔）", type: "textarea", required: true },
    { name: "mode", label: "模式", type: "select", default: "pad", options: [
      { value: "pad", label: "补零" },
      { value: "thousands", label: "千分位" },
      { value: "currency", label: "金额（两位小数）" },
      { value: "percent", label: "百分比" },
    ] },
    { name: "digits", label: "补零位数", type: "number", default: 2 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "input");
      const mode = str(input, "mode", "pad");
      const digits = Math.max(0, Math.min(20, num(input, "digits", 2)));
      const parts = raw.split(/[\s,，\n]+/).filter(Boolean);
      const out = parts.map((p) => {
        const n = Number(p);
        if (!Number.isFinite(n)) return p;
        switch (mode) {
          case "thousands": return n.toLocaleString("en-US", { maximumFractionDigits: 20 });
          case "currency": return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          case "percent": return `${(n * 100).toFixed(digits)}%`;
          default: {
            const neg = n < 0;
            const s = Math.abs(n).toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(Math.max(1, Math.abs(n))))));
            return `${neg ? "-" : ""}${s.padStart(digits, "0")}`;
          }
        }
      });
      return okResult({ text: out.join("\n"), count: out.length }, "text/plain", "numbers.txt");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};
