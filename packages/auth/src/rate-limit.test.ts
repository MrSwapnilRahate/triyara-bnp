import { describe, expect, it } from 'vitest'

import { createInMemoryRateLimiter } from './rate-limit'

describe('rate limiter', () => {
  it('allows up to the limit then blocks', () => {
    const rl = createInMemoryRateLimiter(2, 1000)
    expect(rl.check('k').allowed).toBe(true)
    expect(rl.check('k').allowed).toBe(true)
    expect(rl.check('k').allowed).toBe(false)
    expect(rl.check('other').allowed).toBe(true)
  })
})
