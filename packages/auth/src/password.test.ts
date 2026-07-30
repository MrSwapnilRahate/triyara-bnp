import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password'

/**
 * bcrypt at cost 12 is deliberately slow, and bcryptjs is a pure-JS
 * implementation, so this test does three genuinely expensive operations: one
 * hash and two compares. That is ~580ms on an idle developer machine.
 *
 * On a contended CI runner - four workspace suites in parallel plus a Postgres
 * service container - the same work has been measured past the 5s default and
 * failed the suite for no real reason.
 *
 * The timeout is raised for THIS TEST ONLY so it remains a hang detector rather
 * than a performance policy. Every other test in the package keeps the 5s
 * default, which is a useful signal. The cost factor, the implementation and
 * the assertions are unchanged.
 */
const BCRYPT_TIMEOUT_MS = 30_000

describe('password', () => {
  it(
    'hashes and verifies round-trip',
    async () => {
      const hash = await hashPassword('s3cret!')
      expect(hash).not.toBe('s3cret!')
      expect(await verifyPassword('s3cret!', hash)).toBe(true)
      expect(await verifyPassword('wrong', hash)).toBe(false)
    },
    BCRYPT_TIMEOUT_MS,
  )
})
