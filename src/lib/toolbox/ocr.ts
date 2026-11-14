/** OCR 引擎：调用外部命令 tesseract。未安装时明确返回 ok:false。 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { okResult, errResult, toBuffer, str, type ToolEngineExt, type ToolResult } from "./types";

const execFileAsync = promisify(execFile);

export const ocrImage: ToolEngineExt = {
  name: "ocr.image",
  category: "ocr",
  description: "识别图片中的文字（需要系统安装 tesseract，支持中英文）。",
  fields: [
    { name: "file", label: "图片", type: "file", required: true },
    { name: "lang", label: "识别语言", type: "select", default: "chi_sim+eng", options: [
      { value: "chi_sim+eng", label: "中文 + 英文" },
      { value: "chi_sim", label: "中文简体" },
      { value: "chi_tra+eng", label: "中文繁体 + 英文" },
      { value: "eng", label: "英文" },
      { value: "jpn+eng", label: "日文 + 英文" },
      { value: "kor+eng", label: "韩文 + 英文" },
    ] },
    { name: "psm", label: "页面分割模式（3=自动）", type: "number", default: 3 },
  ],
  async run(input): Promise<ToolResult> {
    let dir: string | null = null;
    try {
      const buf = toBuffer(input, "file");
      const lang = str(input, "lang", "chi_sim+eng");
      const psm = Math.max(0, Math.min(13, Number(input.psm ?? 3) || 3));
      dir = await mkdtemp(join(tmpdir(), "bn-ocr-"));
      const imgPath = join(dir, "input.png");
      const outBase = join(dir, "out");
      await writeFile(imgPath, buf);
      try {
        await execFileAsync(
          "tesseract",
          [imgPath, outBase, "-l", lang, "--psm", String(psm)],
          { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "ENOENT") {
          return errResult(
            "未安装 tesseract：OCR 需要系统提供 tesseract 命令。Windows 可从 UB-Mannheim 官方包安装并加入 PATH，Linux 可用 apt install tesseract-ocr（中文还需 tesseract-ocr-chi-sim）",
          );
        }
        const stderr = (err as { stderr?: string }).stderr ?? "";
        if (/Failed loading language|not found for language|could not find any languages/i.test(stderr)) {
          return errResult(
            `tesseract 已安装，但缺少语言包「${lang}」。请安装对应 traineddata（如 tesseract-ocr-chi-sim）后重试。原始信息：${stderr.slice(0, 300)}`,
          );
        }
        throw err;
      }
      const text = await readFile(`${outBase}.txt`, "utf8");
      return okResult({ text: text.trim(), chars: text.trim().length }, "text/plain", "ocr.txt");
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};

export const ocrEngines: ToolEngineExt[] = [ocrImage];
