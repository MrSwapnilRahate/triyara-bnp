/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@triyara/lib',
    '@triyara/ui',
    '@triyara/validation',
    '@triyara/core',
    '@triyara/events',
  ],
}

export default nextConfig
