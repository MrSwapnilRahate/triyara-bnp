// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { type ScrubbableEvent, scrubEvent } from '../sentry-scrub'

/** A server event shaped the way the SDK builds one. */
function event(overrides: Partial<ScrubbableEvent> = {}): ScrubbableEvent {
  return {
    request: {
      url: 'https://portal.triyaraexports.com/api/v1/suppliers?q=Acme%20Textiles',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-live-SUPERSECRET',
        cookie: '__Host-authjs.session-token=SESSIONSECRET',
        'x-request-id': 'req-1',
        'user-agent': 'Mozilla/5.0',
      },
      cookies: { 'authjs.session-token': 'SESSIONSECRET' },
      data: { password: 'hunter2', document: 'JVBERi0xLjQKJUEAAA==' },
      query_string: 'q=Acme%20Textiles',
    },
    user: {
      id: 'u1',
      ip_address: '203.0.113.7',
      email: 'buyer@secret.com',
      username: 'buyer',
    },
    ...overrides,
  }
}

describe('credentials never leave the process', () => {
  it('drops the authorization header', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.request!.headers).not.toHaveProperty('authorization')
    expect(JSON.stringify(scrubbed)).not.toContain('sk-live-SUPERSECRET')
  })

  it('drops cookies, both the header and the parsed object', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.request!.headers).not.toHaveProperty('cookie')
    expect(scrubbed.request).not.toHaveProperty('cookies')
    expect(JSON.stringify(scrubbed)).not.toContain('SESSIONSECRET')
  })

  it('drops the request body, which is where a document would be', () => {
    // A supplier's uploaded file and a password on its way to be changed both
    // travel in the body. Neither may be attached to an error report.
    const scrubbed = scrubEvent(event())
    expect(scrubbed.request).not.toHaveProperty('data')
    expect(JSON.stringify(scrubbed)).not.toContain('hunter2')
    expect(JSON.stringify(scrubbed)).not.toContain('JVBERi0xLjQ')
  })

  it('keeps headers by allow-list, not deny-list', () => {
    // A deny-list has to predict every header a proxy might add. This asserts
    // the inverse property: an unknown header is dropped without being named.
    const scrubbed = scrubEvent(
      event({
        request: {
          headers: { 'x-internal-admin-key': 'SECRET', 'content-type': 'application/json' },
        },
      }),
    )
    expect(scrubbed.request!.headers).toEqual({ 'content-type': 'application/json' })
  })
})

describe('the query string is not personal data we get to keep', () => {
  it('strips it from the url', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.request!.url).toBe('https://portal.triyaraexports.com/api/v1/suppliers')
  })

  it('strips the separate query_string field too', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.request).not.toHaveProperty('query_string')
    expect(JSON.stringify(scrubbed)).not.toContain('Acme')
  })

  it('leaves a url that has no query alone', () => {
    const scrubbed = scrubEvent(
      event({ request: { url: 'https://portal.triyaraexports.com/suppliers/abc-123' } }),
    )
    expect(scrubbed.request!.url).toBe('https://portal.triyaraexports.com/suppliers/abc-123')
  })
})

describe('the user is identified, not described', () => {
  it('keeps the id, which is what correlates with our own records', () => {
    expect(scrubEvent(event()).user!.id).toBe('u1')
  })

  it('drops the address, the name and the IP', () => {
    const scrubbed = scrubEvent(event())
    expect(scrubbed.user).toEqual({ id: 'u1' })
    expect(JSON.stringify(scrubbed)).not.toContain('buyer@secret.com')
    expect(JSON.stringify(scrubbed)).not.toContain('203.0.113.7')
  })
})

describe('anything credential-shaped, wherever it appears', () => {
  it('redacts by key name at depth', () => {
    const scrubbed = scrubEvent({
      extra: { config: { storage: { secretAccessKey: 'AWSSECRET', bucket: 'triyara-docs' } } },
    })
    const serialised = JSON.stringify(scrubbed)
    expect(serialised).not.toContain('AWSSECRET')
    // ...without discarding the part that is useful.
    expect(serialised).toContain('triyara-docs')
  })

  it.each([
    ['password', { password: 'x' }],
    ['apiKey', { apiKey: 'x' }],
    ['api_key', { api_key: 'x' }],
    ['accessToken', { accessToken: 'x' }],
    ['authorization', { authorization: 'x' }],
    ['otp', { otp: 'x' }],
    ['credential', { credential: 'x' }],
  ])('redacts %s', (_name, extra) => {
    const scrubbed = scrubEvent({ extra })
    expect(JSON.stringify(scrubbed)).not.toContain('"x"')
  })

  it('does not hang on a cycle', () => {
    // `contexts` is assembled by the SDK from objects we do not control.
    // Hanging inside error reporting is the worst place to hang.
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic.self = cyclic

    expect(() => scrubEvent({ extra: { cyclic } })).not.toThrow()
  })
})

describe('an event with nothing to scrub', () => {
  it('passes through untouched', () => {
    expect(scrubEvent({})).toEqual({})
  })

  it('is still returned, never dropped', () => {
    // Returning null or undefined would discard the event entirely, which
    // would be a silent way to report nothing at all.
    expect(scrubEvent({ request: { method: 'GET' } })).not.toBeNull()
  })
})
