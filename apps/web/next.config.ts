import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@potted/core", "@potted/verifier", "@potted/coordinator", "@potted/chain"],
  // Loaded by Node on the server, not bundled: Anchor's bundled (browser) build lacks its Node wallet.
  serverExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token"],
};

export default config;
