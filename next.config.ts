import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages 静态导出（必需）
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["107.106.111.235", "10.4.0.12", "localhost", "127.0.0.1"],
};

export default nextConfig;
