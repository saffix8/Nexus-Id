/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexusid/types', '@nexusid/sd-jwt'],
  reactStrictMode: true,
};

module.exports = nextConfig;