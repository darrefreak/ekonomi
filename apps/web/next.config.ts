import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ffos/api-client",
    "@ffos/domain",
    "@ffos/schemas",
    "@ffos/utils",
    "@ffos/design-tokens",
  ],
};

export default nextConfig;
