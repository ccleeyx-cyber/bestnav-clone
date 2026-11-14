/**
 * sharp 加载器 + 最小结构类型。
 *
 * sharp 是 Next.js 的可选 peer 依赖：pnpm 严格模式下它通常只存在于
 * node_modules/.pnpm 下，未必被提升到顶层。这里做一次「顶层 → pnpm store」
 * 的解析兜底；都找不到时抛出带明确提示的 Error，由调用方返回 ok:false。
 *
 * 这里刻意不写 `import("sharp")` 类型，避免在 sharp 未安装时 tsc 直接报
 * TS2307；实际能力由运行时是否加载成功决定。
 */

import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* ---------------- 最小结构类型 ---------------- */

export interface SharpResizeOptions {
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "fill" | "inside" | "outside";
  withoutEnlargement?: boolean;
  background?: string | { r: number; g: number; b: number; alpha?: number };
}

export interface SharpExtractOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SharpCompositeInput {
  input: Buffer | string;
  top?: number;
  left?: number;
}

export interface SharpExtendOptions {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  background?: string;
}

export interface SharpMetadata {
  width?: number;
  height?: number;
  format?: string;
  hasAlpha?: boolean;
  channels?: number;
  size?: number;
}

export interface SharpInstance {
  metadata(): Promise<SharpMetadata>;
  resize(opts: SharpResizeOptions): SharpInstance;
  extract(opts: SharpExtractOptions): SharpInstance;
  extend(opts: SharpExtendOptions): SharpInstance;
  flatten(opts?: { background?: string }): SharpInstance;
  composite(inputs: SharpCompositeInput[]): SharpInstance;
  grayscale(): SharpInstance;
  blur(sigma?: number): SharpInstance;
  rotate(angle?: number): SharpInstance;
  png(opts?: { quality?: number }): SharpInstance;
  jpeg(opts?: { quality?: number; mozjpeg?: boolean }): SharpInstance;
  webp(opts?: { quality?: number }): SharpInstance;
  avif(opts?: { quality?: number }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}

export interface SharpFactory {
  (input?: Buffer | string, opts?: { failOn?: string }): SharpInstance;
}

/* ---------------- 加载 ---------------- */

let cached: SharpFactory | null = null;
let cachedError: string | null = null;

function resolveSharp(): string | null {
  const req = createRequire(join(process.cwd(), "package.json"));
  try {
    return req.resolve("sharp");
  } catch {
    /* 继续尝试 pnpm store */
  }
  const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  try {
    const hit = readdirSync(pnpmDir).find((d) => d.startsWith("sharp@"));
    if (hit) {
      const p = join(pnpmDir, hit, "node_modules", "sharp");
      if (existsSync(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 获取 sharp 工厂函数；不可用时抛出带明确提示的 Error。 */
export async function loadSharp(): Promise<SharpFactory> {
  if (cached) return cached;
  if (cachedError) throw new Error(cachedError);

  // 首选原生动态 import（sharp 已在 serverExternalPackages 中排除出 bundle）。
  // 失败时回退到 pnpm store 路径 + createRequire。
  try {
    const mod = (await import("sharp")) as unknown as { default?: SharpFactory } & SharpFactory;
    const factory = (mod.default ?? mod) as SharpFactory;
    if (typeof factory === "function") {
      cached = factory;
      return factory;
    }
  } catch (err) {
    // 继续走回退路径
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot find module") === false) {
      // 其它错误（如原生模块加载失败）直接透出
    }
  }

  const path = resolveSharp();
  if (!path) {
    cachedError =
      "未找到 sharp（图片处理依赖）：请在 package.json 的 dependencies 中加入 sharp 并执行 pnpm install。";
    throw new Error(cachedError);
  }
  try {
    const req = createRequire(join(process.cwd(), "package.json"));
    const mod = req(path) as { default?: SharpFactory } & SharpFactory;
    const factory = (mod.default ?? mod) as SharpFactory;
    if (typeof factory !== "function") throw new Error("sharp 模块导出异常");
    cached = factory;
    return factory;
  } catch (err) {
    cachedError = `sharp 加载失败：${err instanceof Error ? err.message : String(err)}`;
    throw new Error(cachedError);
  }
}
