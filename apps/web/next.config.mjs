/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@triyara/lib',
    '@triyara/ui',
    '@triyara/validation',
    '@triyara/core',
    '@triyara/events',
    '@triyara/auth',
    '@triyara/db',
    '@triyara/email',
    '@triyara/storage',
  ],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default nextConfig
