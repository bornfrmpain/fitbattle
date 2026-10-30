/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node builtin that webpack doesn't know yet; keep it external.
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals || []), { "node:sqlite": "commonjs node:sqlite" }];
    return config;
  },
  poweredByHeader: false,
};
export default nextConfig;
