/**
 * Origin the browser uploads documents to.
 *
 * Uploads are a presigned PUT straight from the browser to S3 or R2, so the
 * storage host is a *different* origin from the app. A `connect-src 'self'`
 * policy would block every document upload in production — and it would fail
 * only on real uploads, which is the worst place to discover it.
 *
 * Read from the same variables the storage adapter uses, so the policy cannot
 * drift from the bucket it is meant to allow.
 */
function storageOrigin() {
  const endpoint = process.env.STORAGE_ENDPOINT
  if (endpoint) {
    try {
      return new URL(endpoint).origin
    } catch {
      // A malformed endpoint must not take the build down; the storage factory
      // already refuses to serve production without valid configuration.
      return null
    }
  }
  const bucket = process.env.STORAGE_BUCKET
  const region = process.env.STORAGE_REGION
  // AWS S3 without a custom endpoint. Both host forms are accepted because the
  // SDK picks between them depending on bucket naming.
  if (bucket && region) return `https://${bucket}.s3.${region}.amazonaws.com`
  return null
}

/**
 * Refuses to produce a policy that would block uploads.
 *
 * `headers()` is evaluated during `next build` and baked into
 * routes-manifest.json — it is NOT re-read when the server starts. So the
 * storage variables have to be present in the BUILD environment, not merely at
 * runtime, and on a platform where the two are configured separately that is
 * easy to get wrong.
 *
 * Getting it wrong is silent: connect-src quietly falls back to 'self', the
 * build succeeds, the app boots, every page works, and then the first supplier
 * to upload a document has the browser refuse the request. Failing the build is
 * the only point where that is still cheap to fix.
 */
function assertStoragePolicyIsUsable(origin) {
  const provider = process.env.STORAGE_PROVIDER
  // `local` writes to the filesystem and uploads never leave the origin, so
  // there is nothing extra to allow.
  if (provider !== 's3' && provider !== 'r2') return
  if (origin) return

  throw new Error(
    `STORAGE_PROVIDER is "${provider}" but no storage origin could be derived at build time.\n` +
      'The Content-Security-Policy is baked into the build, so without it connect-src\n' +
      "falls back to 'self' and the browser will refuse every document upload.\n" +
      'Expose STORAGE_ENDPOINT (R2), or STORAGE_BUCKET and STORAGE_REGION (S3), to the build.',
  )
}

/**
 * Content Security Policy.
 *
 * `script-src` carries 'unsafe-inline' because the App Router injects inline
 * bootstrap and streaming scripts on every page. Removing it requires a
 * per-request nonce threaded through middleware, which this codebase's
 * middleware currently uses for authentication only — that is a separate
 * change, and shipping a policy that white-screens the app would be worse than
 * shipping one that is honest about its limit.
 *
 * The directives that do carry weight here are frame-ancestors, base-uri,
 * form-action and object-src: they stop clickjacking, base-tag injection,
 * form exfiltration and plugin execution outright.
 */
function contentSecurityPolicy() {
  const storage = storageOrigin()
  assertStoragePolicyIsUsable(storage)
  const connect = ["'self'", storage, process.env.NODE_ENV === 'development' ? 'ws:' : null]
    .filter(Boolean)
    .join(' ')

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    // Tailwind ships compiled, but Next injects inline <style> for critical CSS.
    "style-src 'self' 'unsafe-inline'",
    // data: for inline SVG icons, blob: for client-side file previews.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    // Presigned downloads open in a new tab rather than an iframe.
    "frame-src 'none'",
    // Nothing may frame this app: the admin screens act on one click.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // A form must not post anywhere but back to us.
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // Two years, subdomains included. Vercel terminates TLS, but the header is
  // what tells a browser never to try http again.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Full URL to ourselves, origin only to third parties: a supplier id in a
  // path must not leak to whatever a user clicks through to.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs a camera, a microphone or a location.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Isolates this origin from cross-origin popups it opens.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Version and framework are free reconnaissance.
  poweredByHeader: false,
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
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }])
  },
}

export default nextConfig
