import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@potted/core", "@potted/verifier", "@potted/coordinator", "@potted/chain"],
};

export default config;
