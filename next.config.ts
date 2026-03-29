import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出：生成纯静态 HTML/CSS/JS，Cloudflare Pages 可直接托管
  output: "export",

  // 静态导出时，图片不再经过 Next.js 图片优化 API
  images: {
    unoptimized: true,
  },

  // 允许的开发访问
  allowedDevOrigins: ["107.106.111.235", "10.4.0.12", "localhost", "127.0.0.1"],

  // 禁用 Tailwind 浏览器 JIT 减少不一致
  experimental: {
    // staticPageGenerationThreshold: 60,
  },
};

export default nextConfig;
