import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ffos/api-client",
    "@ffos/domain",
    "@ffos/schemas",
    "@ffos/utils",
    "@ffos/design-tokens",
  ],
  experimental: {
    // Tree-shake barrel packages when/if icon or UI libs return.
    optimizePackageImports: ["@ffos/schemas", "@ffos/domain"],
  },
};

export default nextConfig;
