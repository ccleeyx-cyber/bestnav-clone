/** 图片处理引擎（基于 sharp）。 */

import { loadSharp, type SharpInstance } from "./sharp-loader";
import {
  okResult,
  errResult,
  toBuffer,
  str,
  num,
  bool,
  type ToolEngineExt,
  type ToolResult,
} from "./types";
import { encodeQr, qrToSvg } from "./qr";

async function loadImage(input: Record<string, unknown>, key = "file"): Promise<SharpInstance> {
  const buf = toBuffer(input, key);
  const sharp = await loadSharp();
  return sharp(buf, { failOn: "none" });
}

async function outputOf(
  pipeline: SharpInstance,
  mime: string,
  filename: string,
): Promise<ToolResult> {
  const buf = await pipeline.toBuffer();
  return okResult(
    {
      data: `data:${mime};base64,${buf.toString("base64")}`,
      mime,
      filename,
      bytes: buf.length,
    },
    mime,
    filename,
  );
}

function formatMime(format: string): string {
  switch (format) {
    case "png": return "image/png";
    case "jpeg":
    case "jpg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "avif": return "image/avif";
    default: return "application/octet-stream";
  }
}

export const imageCrop: ToolEngineExt = {
  name: "image.crop",
  category: "image",
  description: "裁剪图片（按左上角坐标 + 宽高）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "left", label: "左边距", type: "number", default: 0 },
    { name: "top", label: "上边距", type: "number", default: 0 },
    { name: "width", label: "宽度", type: "number", default: 200 },
    { name: "height", label: "高度", type: "number", default: 200 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const img = await loadImage(input);
      const meta = await img.metadata();
      const width = Math.max(1, num(input, "width", 200));
      const height = Math.max(1, num(input, "height", 200));
      const left = Math.max(0, num(input, "left", 0));
      const top = Math.max(0, num(input, "top", 0));
      if (meta.width && left + width > meta.width) {
        return errResult(`裁剪区域超出图片宽度（图片宽 ${meta.width}px）`);
      }
      if (meta.height && top + height > meta.height) {
        return errResult(`裁剪区域超出图片高度（图片高 ${meta.height}px）`);
      }
      const out = await img.extract({ left, top, width, height }).png().toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "cropped.png", bytes: out.length },
        "image/png",
        "cropped.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageResize: ToolEngineExt = {
  name: "image.resize",
  category: "image",
  description: "缩放图片（可指定宽或高，另一边等比）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "width", label: "宽度（0 表示按高度自适应）", type: "number", default: 0 },
    { name: "height", label: "高度（0 表示按宽度自适应）", type: "number", default: 0 },
    { name: "fit", label: "缩放模式", type: "select", default: "inside", options: [
      { value: "inside", label: "包含（不裁切）" },
      { value: "cover", label: "覆盖（裁切）" },
      { value: "fill", label: "拉伸" },
      { value: "outside", label: "外扩" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const img = await loadImage(input);
      const width = Math.max(0, num(input, "width", 0));
      const height = Math.max(0, num(input, "height", 0));
      if (!width && !height) return errResult("请至少指定宽度或高度");
      const fit = (str(input, "fit", "inside") || "inside") as "inside" | "cover" | "fill" | "outside";
      const out = await img.resize({ width: width || undefined, height: height || undefined, fit }).png().toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "resized.png", bytes: out.length },
        "image/png",
        "resized.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageConvert: ToolEngineExt = {
  name: "image.convert",
  category: "image",
  description: "转换图片格式（PNG / JPEG / WebP / AVIF）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "format", label: "目标格式", type: "select", default: "png", options: [
      { value: "png", label: "PNG" },
      { value: "jpeg", label: "JPEG" },
      { value: "webp", label: "WebP" },
      { value: "avif", label: "AVIF" },
    ] },
    { name: "quality", label: "质量（有损格式有效，1-100）", type: "number", default: 85 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const img = await loadImage(input);
      const format = (str(input, "format", "png") || "png").toLowerCase();
      const quality = Math.max(1, Math.min(100, num(input, "quality", 85)));
      const mime = formatMime(format);
      let pipeline = img;
      if (format === "png") pipeline = img.png({ quality });
      else if (format === "jpeg" || format === "jpg") pipeline = img.flatten({ background: "#ffffff" }).jpeg({ quality });
      else if (format === "webp") pipeline = img.webp({ quality });
      else if (format === "avif") pipeline = img.avif({ quality });
      else return errResult(`不支持的目标格式：${format}`);
      const out = await pipeline.toBuffer();
      const filename = `converted.${format === "jpg" ? "jpeg" : format}`;
      return okResult(
        { data: `data:${mime};base64,${out.toString("base64")}`, mime, filename, bytes: out.length },
        mime,
        filename,
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageCompress: ToolEngineExt = {
  name: "image.compress",
  category: "image",
  description: "压缩图片（按质量压缩并可限制最大边长）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "quality", label: "质量 1-100", type: "number", default: 70 },
    { name: "maxWidth", label: "最大宽度（0 表示不限）", type: "number", default: 0 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const original = buf.length;
      const quality = Math.max(1, Math.min(100, num(input, "quality", 70)));
      const maxWidth = Math.max(0, num(input, "maxWidth", 0));
      const sharp = await loadSharp();
      let img = sharp(buf, { failOn: "none" });
      if (maxWidth > 0) img = img.resize({ width: maxWidth, withoutEnlargement: true });
      const out = await img.jpeg({ quality, mozjpeg: true }).toBuffer();
      return okResult(
        {
          data: `data:image/jpeg;base64,${out.toString("base64")}`,
          mime: "image/jpeg",
          filename: "compressed.jpg",
          bytes: out.length,
          originalBytes: original,
          savedPercent: original ? Math.round((1 - out.length / original) * 100) : 0,
        },
        "image/jpeg",
        "compressed.jpg",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageWatermark: ToolEngineExt = {
  name: "image.watermark",
  category: "image",
  description: "给图片叠加文字水印。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "text", label: "水印文字", type: "text", required: true, default: "BestNav" },
    { name: "opacity", label: "透明度 0-1（越小越淡）", type: "number", default: 0.4 },
    { name: "position", label: "位置", type: "select", default: "southeast", options: [
      { value: "southeast", label: "右下" },
      { value: "southwest", label: "左下" },
      { value: "northeast", label: "右上" },
      { value: "northwest", label: "左上" },
      { value: "center", label: "居中" },
    ] },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const text = str(input, "text", "BestNav");
      if (!text.trim()) return errResult("水印文字不能为空");
      const opacity = Math.max(0, Math.min(1, num(input, "opacity", 0.4)));
      const sharp = await loadSharp();
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      const w = meta.width ?? 800;
      const h = meta.height ?? 600;
      const fontSize = Math.max(12, Math.round(Math.min(w, h) / 18));
      const textWidth = text.length * fontSize * 0.6;
      const pad = 10;
      const positions: Record<string, { left: number; top: number }> = {
        southeast: { left: Math.max(0, w - textWidth - pad * 2), top: Math.max(0, h - fontSize * 1.6) },
        southwest: { left: pad, top: Math.max(0, h - fontSize * 1.6) },
        northeast: { left: Math.max(0, w - textWidth - pad * 2), top: pad },
        northwest: { left: pad, top: pad },
        center: { left: Math.max(0, (w - textWidth) / 2), top: Math.max(0, (h - fontSize * 1.2) / 2) },
      };
      const pos = positions[str(input, "position", "southeast")] ?? positions.southeast!;
      const svg = `<svg width="${w}" height="${h}">
        <text x="${pos.left}" y="${pos.top + fontSize}" font-size="${fontSize}" font-family="sans-serif" fill="white" fill-opacity="${opacity}" stroke="black" stroke-opacity="${Math.min(1, opacity + 0.2)}" stroke-width="1">${escapeXml(text)}</text>
      </svg>`;
      const out = await sharp(buf, { failOn: "none" })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "watermarked.png", bytes: out.length },
        "image/png",
        "watermarked.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

export const imageRotate: ToolEngineExt = {
  name: "image.rotate",
  category: "image",
  description: "旋转图片（任意角度或自动按 EXIF）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "degrees", label: "旋转角度", type: "number", default: 90 },
    { name: "auto", label: "按 EXIF 自动旋转", type: "boolean" },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const img = await loadImage(input);
      const auto = bool(input, "auto", false);
      const pipeline = auto
        ? img.rotate()
        : img.rotate(num(input, "degrees", 90));
      const out = await pipeline.png().toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "rotated.png", bytes: out.length },
        "image/png",
        "rotated.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageGrayscale: ToolEngineExt = {
  name: "image.grayscale",
  category: "image",
  description: "图片转灰度。",
  fields: [{ name: "file", label: "图片", type: "file", required: true }],
  async run(input): Promise<ToolResult> {
    try {
      const out = await (await loadImage(input)).grayscale().png().toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "gray.png", bytes: out.length },
        "image/png",
        "gray.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageBlur: ToolEngineExt = {
  category: "image",
  name: "image.blur",
  description: "图片模糊（高斯模糊）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "sigma", label: "模糊强度 0.3-100", type: "number", default: 5 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const sigma = Math.max(0.3, Math.min(100, num(input, "sigma", 5)));
      const out = await (await loadImage(input)).blur(sigma).png().toBuffer();
      return okResult(
        { data: `data:image/png;base64,${out.toString("base64")}`, mime: "image/png", filename: "blurred.png", bytes: out.length },
        "image/png",
        "blurred.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageBorder: ToolEngineExt = {
  name: "image.border",
  category: "image",
  description: "给图片添加边框。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "width", label: "边框宽度", type: "number", default: 10 },
    { name: "color", label: "边框颜色", type: "text", default: "#ffffff" },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const buf = toBuffer(input, "file");
      const w = Math.max(0, num(input, "width", 10));
      const color = str(input, "color", "#ffffff");
      const sharp = await loadSharp();
      const img = sharp(buf, { failOn: "none" });
      const meta = await img.metadata();
      const out = await img
        .extend({ top: w, bottom: w, left: w, right: w, background: color })
        .png()
        .toBuffer();
      return okResult(
        {
          data: `data:image/png;base64,${out.toString("base64")}`,
          mime: "image/png",
          filename: "bordered.png",
          bytes: out.length,
          originalSize: { width: meta.width, height: meta.height },
        },
        "image/png",
        "bordered.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const qrGenerate: ToolEngineExt = {
  name: "image.qrcode",
  category: "image",
  description: "生成二维码（输出 PNG 图片）。",
  fields: [
    { name: "text", label: "二维码内容", type: "textarea", required: true, default: "https://example.com" },
    { name: "size", label: "尺寸（像素）", type: "number", default: 320 },
    { name: "margin", label: "静区（模块数）", type: "number", default: 4 },
  ],
  async run(input): Promise<ToolResult> {
    try {
      const text = str(input, "text");
      if (!text.trim()) return errResult("二维码内容不能为空");
      const matrix = encodeQr(text);
      const margin = Math.max(0, num(input, "margin", 4));
      const size = Math.max(64, num(input, "size", 320));
      const moduleSize = Math.max(1, Math.floor(size / (matrix.size + margin * 2)));
      const svg = qrToSvg(matrix, margin, moduleSize);
      const sharp = await loadSharp();
      const out = await sharp(Buffer.from(svg)).png().toBuffer();
      return okResult(
        {
          data: `data:image/png;base64,${out.toString("base64")}`,
          mime: "image/png",
          filename: "qrcode.png",
          bytes: out.length,
          matrixSize: matrix.size,
        },
        "image/png",
        "qrcode.png",
      );
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
};

export const imageEngines: ToolEngineExt[] = [
  imageCrop,
  imageResize,
  imageConvert,
  imageCompress,
  imageWatermark,
  imageRotate,
  imageGrayscale,
  imageBlur,
  imageBorder,
  qrGenerate,
];
