import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 产物在 Windows 上需要创建符号链接，EPERM 会导致构建失败。
  // Windows 本地构建改用默认输出（node_modules 直接用），Docker 构建（Linux）仍用 standalone。
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  eslint: { ignoreDuringBuilds: true },
  // sharp 必须由 Node 原生 require —— webpack 打包后 createRequire 不可用，
  // 必须把它排除在 bundle 之外，否则图片引擎会报 "req is not a function"。
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
