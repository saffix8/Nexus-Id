/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexusid/types', '@nexusid/sd-jwt'],
  reactStrictMode: true,
  // Lets `next build` run beside a live `next dev` without clobbering .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

module.exports = nextConfig;