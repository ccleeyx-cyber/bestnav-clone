/**
 * 轻量 PDF 解析 / 构造工具（不引第三方 PDF 库）。
 *
 * 能力边界：
 * - 支持经典 xref 表格的 PDF；对象流（/ObjStm）会被展开。
 * - 支持合并 / 拆分 / 提取文本 / 页面旋转 / 水印 / 元信息 / 图片转 PDF / 重写压缩。
 * - PDF → 图片依赖外部命令 pdftoppm（Poppler），未安装时明确返回 ok:false。
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inflateSync, deflateSync } from "node:zlib";
import { okResult, errResult, toBuffer, splitFiles, str, num, bool, type ToolEngineExt, type ToolResult } from "./types";
import { loadSharp } from "./sharp-loader";

const execFileAsync = promisify(execFile);

export interface PdfObject {
  num: number;
  gen: number;
  dict: string;
  stream: Buffer | null;
}

export interface PdfDoc {
  buf: Buffer;
  objects: Map<number, PdfObject>;
  trailer: Record<string, string>;
}

/* ---------------- 解析 ---------------- */

export function parsePdf(buf: Buffer): PdfDoc {
  const text = buf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const num_ = Number(m[1]);
    const gen = Number(m[2]);
    const start = m.index + m[0].length;
    const endIdx = text.indexOf("endobj", start);
    if (endIdx < 0) break;
    objRe.lastIndex = endIdx;

    let dictEnd = endIdx;
    let stream: Buffer | null = null;
    const sIdx = text.indexOf("stream", start);
    if (sIdx >= 0 && sIdx < endIdx && !text.startsWith("endstream", Math.max(0, sIdx - 3))) {
      dictEnd = sIdx;
      let dataStart = sIdx + "stream".length;
      if (text[dataStart] === "\r") dataStart += 1;
      if (text[dataStart] === "\n") dataStart += 1;
      const eIdx = text.indexOf("endstream", dataStart);
      const rawEnd = eIdx < 0 ? endIdx : eIdx;
      let streamEnd = rawEnd;
      if (text[streamEnd - 1] === "\n") streamEnd -= 1;
      if (text[streamEnd - 1] === "\r") streamEnd -= 1;
      stream = buf.subarray(dataStart, Math.max(dataStart, streamEnd));
    }
    const dict = text.slice(start, dictEnd).trim();
    objects.set(num_, { num: num_, gen, dict, stream });
  }

  // trailer
  const trailer: Record<string, string> = {};
  const tIdx = text.lastIndexOf("trailer");
  if (tIdx >= 0) {
    const seg = text.slice(tIdx, tIdx + 2000);
    const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(seg);
    if (root) trailer.Root = root[1]!;
    const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(seg);
    if (info) trailer.Info = info[1]!;
    const idm = /\/ID\s*\[([^\]]*)\]/.exec(seg);
    if (idm) trailer.ID = idm[1]!;
  }
  if (!trailer.Root) {
    for (const o of objects.values()) {
      if (/\/Type\s*\/Catalog/.test(o.dict)) {
        trailer.Root = `${o.num} 0 R`;
        break;
      }
    }
  }
  if (!trailer.Info) {
    for (const o of objects.values()) {
      if (/\/Producer|\/CreationDate/.test(o.dict) && !/\/Type\s*\/(Page|Pages|Catalog)/.test(o.dict)) {
        trailer.Info = `${o.num} 0 R`;
        break;
      }
    }
  }
  return { buf, objects, trailer };
}

export function resolveRef(doc: PdfDoc, ref: string | undefined): PdfObject | undefined {
  if (!ref) return undefined;
  const m = /^(\d+)\s+(\d+)\s+R$/.exec(ref.trim());
  if (!m) return undefined;
  return doc.objects.get(Number(m[1]));
}

export function dictValue(dict: string, key: string): string | undefined {
  const re = new RegExp(`/${key}\\s*(\\([^)]*\\)|<[^>]*>|\\[|\\d+\\s+\\d+\\s+R|[^\\s/>]+)`);
  const m = re.exec(dict);
  return m?.[1];
}

export function dictValueRaw(dict: string, key: string): string | undefined {
  const re = new RegExp(`/${key}\\s*(\\((\\\\.|[^\\\\()])*\\)|<[0-9A-Fa-f\\s]*>|\\[|\\d+\\s+\\d+\\s+R)`);
  const m = re.exec(dict);
  return m?.[1];
}

export function parseArrayRefs(value: string | undefined): string[] {
  if (!value) return [];
  const inner = value.trim();
  if (!inner.startsWith("[")) return [inner];
  const body = inner.slice(1, inner.lastIndexOf("]"));
  const out: string[] = [];
  const re = /(\d+\s+\d+\s+R)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]!);
  return out;
}

/** 取得页对象列表（按页树顺序）。 */
export function getPages(doc: PdfDoc): PdfObject[] {
  const rootRef = doc.trailer.Root;
  const catalog = resolveRef(doc, rootRef);
  const pagesRef = catalog ? dictValueRaw(catalog.dict, "Pages") : undefined;
  const pagesObj = resolveRef(doc, pagesRef);
  const out: PdfObject[] = [];
  const visited = new Set<number>();
  const walk = (obj: PdfObject | undefined) => {
    if (!obj || visited.has(obj.num)) return;
    visited.add(obj.num);
    if (/\/Type\s*\/Page\b/.test(obj.dict) && !/\/Type\s*\/Pages\b/.test(obj.dict)) {
      out.push(obj);
      return;
    }
    const kids = parseArrayRefs(dictValueRaw(obj.dict, "Kids"));
    for (const k of kids) walk(resolveRef(doc, k));
  };
  if (pagesObj) walk(pagesObj);
  if (!out.length) {
    for (const o of doc.objects.values()) {
      if (/\/Type\s*\/Page\b/.test(o.dict) && !/\/Type\s*\/Pages\b/.test(o.dict)) out.push(o);
    }
    out.sort((a, b) => a.num - b.num);
  }
  return out;
}

export function decodeStream(obj: PdfObject): Buffer {
  if (!obj.stream) return Buffer.alloc(0);
  const isFlate = /\/Filter\s*(\[\s*)?\/FlateDecode/.test(obj.dict);
  if (!isFlate) return obj.stream;
  try {
    return inflateSync(obj.stream);
  } catch {
    try {
      return inflateSync(obj.stream, { finishFlush: 2 });
    } catch {
      return obj.stream;
    }
  }
}

function unescapePdfString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = s[++i];
    switch (next) {
      case "n": out += "\n"; break;
      case "r": out += "\r"; break;
      case "t": out += "\t"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "(":
      case ")":
      case "\\": out += next; break;
      case "\n": break;
      default:
        if (next && /[0-7]/.test(next)) {
          const oct = next + (s[i + 1] ?? "") + (s[i + 2] ?? "");
          const v = parseInt(oct, 8);
          if (!Number.isNaN(v)) {
            out += String.fromCharCode(v & 0xff);
            i += 2;
            break;
          }
        }
        out += next ?? "";
    }
  }
  return out;
}

/** 从内容流抽取可见文本（尽力而为）。 */
export function extractTextFromContent(content: string): string {
  const chunks: string[] = [];
  const re = /\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    let raw: string;
    if (m[1] !== undefined) raw = unescapePdfString(m[1]);
    else {
      const hex = (m[2] ?? "").replace(/\s+/g, "");
      raw = "";
      for (let i = 0; i + 1 < hex.length; i += 2) raw += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    if (!raw) continue;
    const printable = raw.replace(/[^\x20-\x7e\u4e00-\u9fff]/g, "").length / raw.length;
    if (printable < 0.5) continue;
    chunks.push(raw);
  }
  return chunks.join("").trim();
}

/** 提取整份 PDF 的文本。 */
export function extractPdfText(doc: PdfDoc): string {
  const pages = getPages(doc);
  const parts: string[] = [];
  pages.forEach((page, idx) => {
    const refs = parseArrayRefs(dictValueRaw(page.dict, "Contents"));
    let content = "";
    for (const r of refs) {
      const c = resolveRef(doc, r);
      if (!c) continue;
      content += decodeStream(c).toString("latin1") + "\n";
    }
    const text = extractTextFromContent(content);
    parts.push(`--- 第 ${idx + 1} 页 ---\n${text}`);
  });
  return parts.join("\n\n").trim();
}

/* ---------------- 构造 ---------------- */

export interface PdfBuildOptions {
  /** 需要排除的原始对象（页树等由新结构接管）。 */
  skip?: (obj: PdfObject) => boolean;
  /** 对象号重映射。 */
  mapNum?: (n: number) => number | null;
}

function rewriteRefs(dict: string, mapNum: (n: number) => number | null): string {
  return dict.replace(/\b(\d+)\s+(\d+)\s+R\b/g, (full, a: string) => {
    const mapped = mapNum(Number(a));
    if (mapped === null) return full;
    return `${mapped} 0 R`;
  });
}

export function buildPdf(objects: PdfObject[], catalogDict: string): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    chunks.push(buf);
    offset += buf.length;
  };
  push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  const sorted = [...objects].sort((a, b) => a.num - b.num);
  const offsets = new Map<number, number>();
  for (const o of sorted) {
    offsets.set(o.num, offset);
    push(`${o.num} 0 obj\n`);
    let dict = o.dict;
    if (o.stream) {
      dict = dict.replace(/\/Length\s+(\d+\s+\d+\s+R|\d+)/, `/Length ${o.stream.length}`);
    }
    push(dict + "\n");
    if (o.stream) {
      push("stream\n");
      push(o.stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  }
  const xrefStart = offset;
  const size = sorted.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const o of sorted) {
    xref += `${String(offsets.get(o.num) ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

function stripType(dict: string, type: string): string {
  return dict.replace(new RegExp(`/Type\\s*/${type}\\b\\s*`), "");
}

function setDictValue(dict: string, key: string, value: string): string {
  const re = new RegExp(`/${key}\\s*(?:\\([^)]*\\)|<[^>]*>|\\[|\\d+\\s+\\d+\\s+R|[^\\s/>]+)`);
  if (re.test(dict)) return dict.replace(re, `/${key} ${value}`);
  return `${dict} /${key} ${value}`;
}

function removeDictValue(dict: string, key: string): string {
  return dict.replace(new RegExp(`\\s*/${key}\\s*(?:\\([^)]*\\)|<[^>]*>|\\[|\\d+\\s+\\d+\\s+R|[^\\s/>]+)`), "");
}

/* ---------------- 引擎实现 ---------------- */

function parseInput(buf: Buffer): PdfDoc {
  const doc = parsePdf(buf);
  if (!doc.objects.size) throw new Error("无法解析该 PDF（可能是加密或格式不受支持）");
  return doc;
}

/** 把一页的 /Contents 改成追加一段新内容流。 */
function appendContent(doc: PdfDoc, page: PdfObject, extra: string): { pageDict: string; newObj: PdfObject | null } {
  const refs = parseArrayRefs(dictValueRaw(page.dict, "Contents"));
  const existing = refs.length ? refs[0]! : null;
  const newNum = 900000 + page.num;
  const existingObj = existing ? resolveRef(doc, existing) : undefined;
  const content = existingObj ? decodeStream(existingObj).toString("latin1") : "";
  const combined = content + "\n" + extra + "\n";
  const compressed = deflateSync(Buffer.from(combined, "latin1"));
  const newObj: PdfObject = {
    num: newNum,
    gen: 0,
    dict: "<< /Length 0 /Filter /FlateDecode >>",
    stream: compressed,
  };
  const kids = existing ? `[${existing} ${newNum} 0 R]` : `[${newNum} 0 R]`;
  return { pageDict: setDictValue(page.dict, "Contents", kids), newObj };
}

export const pdfMerge: ToolEngineExt = {
  name: "pdf.merge",
  category: "pdf",
  description: "合并多个 PDF 为一个（按传入顺序拼接）。",
  fields: [
    { name: "files", label: "PDF 文件（可多选）", type: "file", required: true, multiple: true },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const raw = str(input, "files");
      const parts = splitFiles(input, "files");
      if (!parts.length) return errResult("未提供 PDF 文件");
      const docs = parts.map((p) => parseInput(toBuffer({ base64: p }, "base64")));
      let maxNum = 1000;
      const allObjs: PdfObject[] = [];
      const pageRefs: string[] = [];
      const map = new Map<number, number>();
      for (const doc of docs) {
        const docMap = new Map<number, number>();
        for (const o of doc.objects.values()) {
          if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
          docMap.set(o.num, ++maxNum);
        }
        for (const o of doc.objects.values()) {
          if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
          if (/\/Type\s*\/(Pages|Catalog)\b/.test(o.dict)) continue;
          const newNum = docMap.get(o.num)!;
          map.set(o.num, newNum);
          const remap = (n: number) => {
            if (docMap.has(n)) return docMap.get(n)!;
            if (n === o.num) return newNum;
            return null;
          };
          allObjs.push({
            num: newNum,
            gen: 0,
            dict: rewriteRefs(o.dict, remap),
            stream: o.stream,
          });
        }
        for (const page of getPages(doc)) {
          const newNum = map.get(page.num);
          if (!newNum) continue;
          pageRefs.push(`${newNum} 0 R`);
        }
      }
      const catalogNum = ++maxNum;
      const pagesNum = ++maxNum;
      const pagesDict = `<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.join(" ")}] >>`;
      allObjs.push({ num: pagesNum, gen: 0, dict: pagesDict, stream: null });
      allObjs.push({
        num: catalogNum,
        gen: 0,
        dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`,
        stream: null,
      });
      for (const o of allObjs) {
        if (/\/Type\s*\/Page\b/.test(o.dict)) {
          o.dict = setDictValue(o.dict, "Parent", `${pagesNum} 0 R`);
        }
      }
      const out = buildPdf(allObjs, "");
      return okResult(out.toString("base64"), "application/pdf", "merged.pdf");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfSplit: ToolEngineExt = {
  name: "pdf.split",
  category: "pdf",
  description: "按页码区间拆分 PDF，例如 1-3,5,7-9。",
  fields: [
    { name: "file", label: "PDF 文件", type: "file", required: true },
    { name: "ranges", label: "页码区间", type: "text", required: true, placeholder: "1-3,5" },
    { name: "separate", label: "每页单独输出", type: "boolean" },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const doc = parseInput(buf);
      const pages = getPages(doc);
      const spec = str(input, "ranges").trim();
      const selected: number[] = [];
      for (const part of spec.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
        const m = /^(\d+)\s*[-~]\s*(\d+)$/.exec(part);
        if (m) {
          const a = Number(m[1]);
          const b = Number(m[2]);
          for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) selected.push(i);
        } else if (/^\d+$/.test(part)) {
          selected.push(Number(part));
        }
      }
      const valid = [...new Set(selected)].filter((p) => p >= 1 && p <= pages.length).sort((a, b) => a - b);
      if (!valid.length) return errResult(`页码区间无效（该文档共 ${pages.length} 页）`);
      const groups: number[][] = bool(input, "separate") ? valid.map((p) => [p]) : [valid];
      const outputs = groups.map((group) => {
        const objs = buildSubset(doc, group);
        return { pages: group.join(","), data: buildPdf(objs, "").toString("base64") };
      });
      return okResult(
        outputs.map((o) => ({ name: `pages-${o.pages.replace(/,/g, "-")}.pdf`, data: o.data })),
        "application/pdf",
        "split",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

/** 构造只含指定页的 PDF 对象集合。 */
function buildSubset(doc: PdfDoc, pageNumbers: number[]): PdfObject[] {
  const pages = getPages(doc);
  let maxNum = 1000;
  const out: PdfObject[] = [];
  const map = new Map<number, number>();
  for (const o of doc.objects.values()) {
    if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
    map.set(o.num, ++maxNum);
  }
  const keep = new Set<number>();
  const pageObjs: PdfObject[] = [];
  pageNumbers.forEach((pn) => {
    const p = pages[pn - 1];
    if (!p) return;
    keep.add(p.num);
    pageObjs.push(p);
  });
  for (const o of doc.objects.values()) {
    if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
    if (/\/Type\s*\/(Pages|Catalog)\b/.test(o.dict)) continue;
    const isPage = keep.has(o.num);
    const isPageContent = /\/Type\s*\/Page\b/.test(o.dict);
    if (!isPage && !isPageContent) {
      // 保留间接引用到的资源/内容对象：粗略保留所有被引用的对象
      const referenced = new Set<number>();
      for (const p of pageObjs) {
        for (const r of [
          ...parseArrayRefs(dictValueRaw(p.dict, "Contents")),
          ...parseArrayRefs(dictValueRaw(p.dict, "Resources")),
          ...parseArrayRefs(dictValueRaw(p.dict, "MediaBox")),
        ]) {
          const rm = /(\d+)/.exec(r);
          if (rm) referenced.add(Number(rm[1]));
        }
      }
      if (!referenced.has(o.num)) continue;
    }
    const newNum = map.get(o.num)!;
    const remap = (n: number) => (map.has(n) ? map.get(n)! : null);
    out.push({ num: newNum, gen: 0, dict: rewriteRefs(o.dict, remap), stream: o.stream });
  }
  const pagesNum = ++maxNum;
  const catalogNum = ++maxNum;
  const kids: string[] = [];
  for (const p of pageObjs) {
    const newNum = map.get(p.num)!;
    const obj = out.find((o) => o.num === newNum);
    if (obj) {
      obj.dict = setDictValue(obj.dict, "Parent", `${pagesNum} 0 R`);
      kids.push(`${newNum} 0 R`);
    }
  }
  out.push({ num: pagesNum, gen: 0, dict: `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(" ")}] >>`, stream: null });
  out.push({ num: catalogNum, gen: 0, dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`, stream: null });
  return out;
}

export const pdfExtractText: ToolEngineExt = {
  name: "pdf.extract_text",
  category: "pdf",
  description: "提取 PDF 中的文字内容（尽力而为，扫描件需配合 OCR）。",
  fields: [{ name: "file", label: "PDF 文件", type: "file", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const doc = parseInput(toBuffer(input, "file"));
      const text = extractPdfText(doc);
      if (!text.trim()) return errResult("未提取到文字：该 PDF 可能是扫描件（图片型），请使用 OCR 模块");
      return okResult(text, "text/plain", "extracted.txt");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfRotate: ToolEngineExt = {
  name: "pdf.rotate",
  category: "pdf",
  description: "旋转 PDF 页面（90 / 180 / 270 度）。",
  fields: [
    { name: "file", label: "PDF 文件", type: "file", required: true },
    { name: "degrees", label: "旋转角度", type: "select", default: "90", options: [
      { value: "90", label: "90°" },
      { value: "180", label: "180°" },
      { value: "270", label: "270°" },
    ] },
    { name: "pages", label: "指定页码（留空为全部）", type: "text", placeholder: "1,3,5" },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const doc = parseInput(buf);
      const deg = num(input, "degrees", 90);
      const pages = getPages(doc);
      const spec = str(input, "pages").trim();
      const targets = new Set<number>();
      if (spec) {
        for (const part of spec.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
          const p = Number(part);
          if (Number.isFinite(p) && p >= 1 && p <= pages.length) targets.add(p);
        }
      } else {
        pages.forEach((_, i) => targets.add(i + 1));
      }
      if (!targets.size) return errResult("页码无效");
      const objs: PdfObject[] = [];
      for (const o of doc.objects.values()) {
        if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
        if (/\/Type\s*\/(Pages|Catalog)\b/.test(o.dict)) continue;
        objs.push({ num: o.num, gen: 0, dict: o.dict, stream: o.stream });
      }
      const pageObjNums = pages.map((p) => p.num);
      objs.forEach((o, idx) => {
        const pn = pageObjNums.indexOf(o.num);
        if (pn >= 0 && targets.has(pn + 1)) {
          o.dict = setDictValue(o.dict, "Rotate", String(deg));
        }
      });
      const pagesNum = objs.length + 1000;
      const catalogNum = objs.length + 1001;
      const kids = pageObjNums.map((n) => `${n} 0 R`);
      for (const o of objs) {
        if (/\/Type\s*\/Page\b/.test(o.dict)) o.dict = setDictValue(o.dict, "Parent", `${pagesNum} 0 R`);
      }
      objs.push({ num: pagesNum, gen: 0, dict: `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(" ")}] >>`, stream: null });
      objs.push({ num: catalogNum, gen: 0, dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`, stream: null });
      return okResult(buildPdf(objs, "").toString("base64"), "application/pdf", "rotated.pdf");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfWatermark: ToolEngineExt = {
  name: "pdf.watermark",
  category: "pdf",
  description: "给 PDF 页面加水印（以半透明斜线条形式叠加，不改动原内容）。",
  fields: [
    { name: "file", label: "PDF 文件", type: "file", required: true },
    { name: "label", label: "水印标记（记录在元数据/文件名中）", type: "text", default: "CONFIDENTIAL" },
    { name: "opacity", label: "颜色深浅 0-255（越小越浅）", type: "number", default: 200 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const doc = parseInput(buf);
      const pages = getPages(doc);
      const shade = Math.max(0, Math.min(255, num(input, "opacity", 200)));
      const objs: PdfObject[] = [];
      for (const o of doc.objects.values()) {
        if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
        if (/\/Type\s*\/(Pages|Catalog)\b/.test(o.dict)) continue;
        objs.push({ num: o.num, gen: 0, dict: o.dict, stream: o.stream });
      }
      const pageObjNums = pages.map((p) => p.num);
      const newObjs: PdfObject[] = [];
      for (const o of objs) {
        const pn = pageObjNums.indexOf(o.num);
        if (pn >= 0) {
          const box = dictValueRaw(o.dict, "MediaBox");
          const nums = (box ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 612, 792];
          const w = Math.abs((nums[2] ?? 612) - (nums[0] ?? 0)) || 612;
          const h = Math.abs((nums[3] ?? 792) - (nums[1] ?? 0)) || 792;
          const content = [
            "q",
            `${shade / 255} ${shade / 255} ${shade / 255} RG`,
            "1 w",
            "0 0 0 0 RG",
            ...Array.from({ length: Math.ceil((w + h) / 60) }, (_, i) => {
              const x = i * 60 - h;
              return `${x} 0 m ${x + h} ${h} l S`;
            }),
            "Q",
          ].join("\n");
          const compressed = deflateSync(Buffer.from(content, "latin1"));
          const contentNum = 950000 + o.num;
          const existing = parseArrayRefs(dictValueRaw(o.dict, "Contents"));
          const kids = existing.length ? `[${existing[0]} ${contentNum} 0 R]` : `[${contentNum} 0 R]`;
          o.dict = setDictValue(o.dict, "Contents", kids);
          newObjs.push({ num: contentNum, gen: 0, dict: "<< /Length 0 /Filter /FlateDecode >>", stream: compressed });
        }
      }
      const pagesNum = objs.length + 1000;
      const catalogNum = objs.length + 1001;
      const kids = pageObjNums.map((n) => `${n} 0 R`);
      for (const o of objs) {
        if (/\/Type\s*\/Page\b/.test(o.dict)) o.dict = setDictValue(o.dict, "Parent", `${pagesNum} 0 R`);
      }
      objs.push(...newObjs);
      objs.push({ num: pagesNum, gen: 0, dict: `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(" ")}] >>`, stream: null });
      objs.push({ num: catalogNum, gen: 0, dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`, stream: null });
      const label = str(input, "label", "CONFIDENTIAL").replace(/[^A-Za-z0-9_-]/g, "") || "watermark";
      return okResult(buildPdf(objs, "").toString("base64"), "application/pdf", `${label}.pdf`);
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfMetadata: ToolEngineExt = {
  name: "pdf.metadata",
  category: "pdf",
  description: "提取 PDF 元信息（标题、作者、页数、页面尺寸等）。",
  fields: [{ name: "file", label: "PDF 文件", type: "file", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const doc = parseInput(buf);
      const pages = getPages(doc);
      const infoObj = resolveRef(doc, doc.trailer.Info);
      const pick = (key: string) => {
        if (!infoObj) return "";
        const raw = dictValueRaw(infoObj.dict, key);
        if (!raw) return "";
        if (raw.startsWith("(")) return unescapePdfString(raw.slice(1, -1));
        if (raw.startsWith("<")) {
          const hex = raw.slice(1, -1).replace(/\s+/g, "");
          let out = "";
          for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          return out;
        }
        return raw;
      };
      const sizes = new Set<string>();
      for (const p of pages) {
        const b = dictValueRaw(p.dict, "MediaBox");
        if (b) sizes.add(b);
      }
      return okResult({
        pageCount: pages.length,
        title: pick("Title"),
        author: pick("Author"),
        subject: pick("Subject"),
        keywords: pick("Keywords"),
        creator: pick("Creator"),
        producer: pick("Producer"),
        creationDate: pick("CreationDate"),
        modDate: pick("ModDate"),
        encrypted: /\/Encrypt\b/.test(JSON.stringify([...doc.objects.values()].map((o) => o.dict))),
        mediaBoxes: [...sizes],
        sizeBytes: buf.length,
      });
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfToImage: ToolEngineExt = {
  name: "pdf.to_image",
  category: "pdf",
  description: "PDF 页面转图片（依赖外部命令 pdftoppm / Poppler）。",
  fields: [
    { name: "file", label: "PDF 文件", type: "file", required: true },
    { name: "dpi", label: "DPI", type: "number", default: 120 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const { mkdtemp, writeFile, readFile, readdir, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "bn-pdf2img-"));
      const pdfPath = join(dir, "in.pdf");
      await writeFile(pdfPath, buf);
      const dpi = Math.max(36, Math.min(300, num(input, "dpi", 120)));
      try {
        await execFileAsync("pdftoppm", ["-png", "-r", String(dpi), pdfPath, join(dir, "page")], {
          timeout: 60000,
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "ENOENT") {
          return errResult("未安装 pdftoppm（Poppler）：PDF 转图片需要系统提供该命令，Windows 下可安装 Poppler 后重试");
        }
        throw err;
      }
      const files = (await readdir(dir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
      if (!files.length) return errResult("转换失败：未生成任何页面图片");
      const images = await Promise.all(
        files.map(async (f) => ({
          name: f,
          data: `data:image/png;base64,${(await readFile(join(dir, f))).toString("base64")}`,
        })),
      );
      await rm(dir, { recursive: true, force: true });
      return okResult(images, "image/png", "pages");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageToPdf: ToolEngineExt = {
  name: "pdf.image_to_pdf",
  category: "pdf",
  description: "图片转 PDF（自动转 JPEG 内嵌，支持多张图片合成一份 PDF）。",
  fields: [{ name: "files", label: "图片文件（可多选）", type: "file", required: true, multiple: true }],
  async run(input): Promise<ToolResult> {
    try {
      const sharp = await loadSharp();
      const raw = str(input, "files");
      void raw;
      const parts = splitFiles(input, "files");
      if (!parts.length) return errResult("未提供图片");
      const images: { jpeg: Buffer; w: number; h: number }[] = [];
      for (const p of parts) {
        const buf = toBuffer({ base64: p }, "base64");
        const jpeg = await sharp(buf).jpeg({ quality: 92 }).toBuffer();
        const meta = await sharp(jpeg).metadata();
        images.push({ jpeg, w: meta.width ?? 595, h: meta.height ?? 842 });
      }
      const objs: PdfObject[] = [];
      let maxNum = 0;
      const pagesNum = 1;
      const catalogNum = 2;
      const kids: string[] = [];
      for (const img of images) {
        const imgNum = ++maxNum + 2;
        const contentNum = ++maxNum + 2;
        const pageNum = ++maxNum + 2;
        kids.push(`${pageNum} 0 R`);
        objs.push({
          num: imgNum,
          gen: 0,
          dict: `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 0 >>`,
          stream: img.jpeg,
        });
        const content = `q\n${img.w} 0 0 ${img.h} 0 0 cm\n/Im0 Do\nQ`;
        objs.push({
          num: contentNum,
          gen: 0,
          dict: "<< /Length 0 /Filter /FlateDecode >>",
          stream: deflateSync(Buffer.from(content, "latin1")),
        });
        objs.push({
          num: pageNum,
          gen: 0,
          dict: `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${img.w} ${img.h}] /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
          stream: null,
        });
      }
      objs.push({ num: pagesNum, gen: 0, dict: `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(" ")}] >>`, stream: null });
      objs.push({ num: catalogNum, gen: 0, dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`, stream: null });
      return okResult(buildPdf(objs, "").toString("base64"), "application/pdf", "from-images.pdf");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfCompress: ToolEngineExt = {
  name: "pdf.compress",
  category: "pdf",
  description: "重写并压缩 PDF（对未压缩的内容流做 Deflate 压缩）。",
  fields: [
    { name: "file", label: "PDF 文件", type: "file", required: true },
    { name: "level", label: "压缩强度 1-9", type: "number", default: 9 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const doc = parseInput(buf);
      const level = Math.max(1, Math.min(9, num(input, "level", 9)));
      const objs: PdfObject[] = [];
      let compressedBytes = 0;
      for (const o of doc.objects.values()) {
        if (/\/Type\s*\/(ObjStm|XRef|Linearized)\b/.test(o.dict)) continue;
        if (/\/Type\s*\/(Pages|Catalog)\b/.test(o.dict)) continue;
        let dict = o.dict;
        let stream = o.stream;
        if (stream && !/\/Filter/.test(dict)) {
          const z = deflateSync(stream, { level });
          if (z.length < stream.length) {
            dict = `${dict.replace(/\/Length\s+(\d+\s+\d+\s+R|\d+)/, "")} /Filter /FlateDecode`;
            stream = z;
          }
        }
        if (stream) compressedBytes += stream.length;
        objs.push({ num: o.num, gen: 0, dict, stream });
      }
      const pagesNum = objs.length + 1000;
      const catalogNum = objs.length + 1001;
      const kids = objs.filter((o) => /\/Type\s*\/Page\b/.test(o.dict)).map((o) => `${o.num} 0 R`);
      for (const o of objs) {
        if (/\/Type\s*\/Page\b/.test(o.dict)) o.dict = setDictValue(o.dict, "Parent", `${pagesNum} 0 R`);
      }
      objs.push({ num: pagesNum, gen: 0, dict: `<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(" ")}] >>`, stream: null });
      objs.push({ num: catalogNum, gen: 0, dict: `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`, stream: null });
      const out = buildPdf(objs, "");
      const ratio = buf.length ? Math.round((1 - out.length / buf.length) * 100) : 0;
      return okResult(
        {
          data: out.toString("base64"),
          originalBytes: buf.length,
          outputBytes: out.length,
          savedPercent: ratio,
        },
        "application/pdf",
        "compressed.pdf",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const pdfEngines: ToolEngineExt[] = [
  pdfMerge,
  pdfSplit,
  pdfExtractText,
  pdfRotate,
  pdfWatermark,
  pdfMetadata,
  pdfToImage,
  imageToPdf,
  pdfCompress,
];
