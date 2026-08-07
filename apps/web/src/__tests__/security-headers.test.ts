// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

// The headers are computed at module load from the environment, so each case
// sets the environment and imports a fresh copy.

const KEYS = ['STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_REGION'] as const
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

function env(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function headers(): Promise<Record<string, string>> {
  vi.resetModules()
  const mod = await import('../../next.config.mjs')
  const config = mod.default as {
    headers: () => Promise<{ headers: { key: string; value: string }[] }[]>
  }
  const rules = await config.headers()
  return Object.fromEntries(rules[0]!.headers.map((h) => [h.key, h.value]))
}

async function csp(): Promise<string> {
  return (await headers())['Content-Security-Policy'] ?? ''
}

function directive(policy: string, name: string): string {
  return policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''
}

describe('the headers that stop an attack outright', () => {
  it('refuses to be framed', async () => {
    // The admin screens act on a single click; a framing attack would be a
    // click the administrator did not know they were making.
    const h = await headers()
    expect(directive(h['Content-Security-Policy']!, 'frame-ancestors')).toBe(
      "frame-ancestors 'none'",
    )
    expect(h['X-Frame-Options']).toBe('DENY')
  })

  it('pins the base URI and form target to this origin', async () => {
    const policy = await csp()
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'")
    // Without this, an injected form could post a supplier's documents
    // somewhere else.
    expect(directive(policy, 'form-action')).toBe("form-action 'self'")
  })

  it('forbids plugins and framing of other origins', async () => {
    const policy = await csp()
    expect(directive(policy, 'object-src')).toBe("object-src 'none'")
    expect(directive(policy, 'frame-src')).toBe("frame-src 'none'")
  })

  it('sets HSTS, nosniff, referrer and permissions policies', async () => {
    const h = await headers()
    expect(h['Strict-Transport-Security']).toContain('max-age=63072000')
    expect(h['Strict-Transport-Security']).toContain('includeSubDomains')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    // A supplier id in a path must not travel to whatever a user clicks to.
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Permissions-Policy']).toContain('camera=()')
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })
})

describe('connect-src must not break document uploads', () => {
  it('allows the R2 endpoint when one is configured', async () => {
    // Uploads are a presigned PUT from the browser straight to storage - a
    // different origin. `connect-src 'self'` would block every upload, and
    // only on a real upload, which is the worst place to find out.
    env({ STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com' })
    expect(directive(await csp(), 'connect-src')).toContain(
      'https://acct123.r2.cloudflarestorage.com',
    )
  })

  it('derives the S3 host from bucket and region when there is no endpoint', async () => {
    env({ STORAGE_BUCKET: 'triyara-docs', STORAGE_REGION: 'ap-south-1' })
    expect(directive(await csp(), 'connect-src')).toContain(
      'https://triyara-docs.s3.ap-south-1.amazonaws.com',
    )
  })

  it('carries only the endpoint origin, never a path', async () => {
    env({ STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com/bucket/key' })
    const connect = directive(await csp(), 'connect-src')
    expect(connect).toContain('https://acct123.r2.cloudflarestorage.com')
    expect(connect).not.toContain('/bucket/key')
  })

  it('does not take the build down on a malformed endpoint', async () => {
    // The storage factory already refuses to serve production without valid
    // configuration; the build should not fail first with a worse message.
    env({ STORAGE_ENDPOINT: 'not a url' })
    await expect(csp()).resolves.toContain("connect-src 'self'")
  })

  it('falls back to self alone when storage is unconfigured', async () => {
    env({})
    expect(directive(await csp(), 'connect-src')).toBe("connect-src 'self'")
  })
})

describe('the policy the app actually needs to run', () => {
  it('permits the inline scripts and styles the App Router injects', async () => {
    // Removing these needs a per-request nonce threaded through middleware.
    // Shipping a policy that white-screens the app would be worse than one
    // that is honest about its limit.
    const policy = await csp()
    expect(directive(policy, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(policy, 'style-src')).toContain("'unsafe-inline'")
  })

  it('permits inline SVG icons and client-side file previews', async () => {
    const policy = await csp()
    expect(directive(policy, 'img-src')).toContain('data:')
    expect(directive(policy, 'img-src')).toContain('blob:')
  })

  it('upgrades insecure requests', async () => {
    expect(await csp()).toContain('upgrade-insecure-requests')
  })
})
