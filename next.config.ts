import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**/*",
      "./node_modules/.pnpm/@napi-rs+canvas-linux-x64-gnu@*/node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
  },
};

export default nextConfig;
