import { describe, expect, it } from 'vitest'

import { type AttemptOutcome, isRetryable, withRetry } from './retry'

const POLICY = { attempts: 3, baseDelayMs: 100, budgetMs: 8_000 }

/** Collects the delays instead of waiting them out, so the suite stays fast. */
function fakeClock() {
  const slept: number[] = []
  let clock = 0
  return {
    slept,
    sleep: (ms: number) => {
      slept.push(ms)
      clock += ms
      return Promise.resolve()
    },
    now: () => clock,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

function outcomes(...list: AttemptOutcome<string>[]) {
  let i = 0
  return () => Promise.resolve(list[Math.min(i++, list.length - 1)] as AttemptOutcome<string>)
}

describe('isRetryable', () => {
  it('retries 5xx, which is the server having a bad moment', () => {
    expect(isRetryable(500, undefined)).toBe(true)
    expect(isRetryable(503, undefined)).toBe(true)
  })

  it('retries 429, the one 4xx that is explicitly temporary', () => {
    expect(isRetryable(429, undefined)).toBe(true)
  })

  it('does not retry other 4xx', () => {
    // A rejected address fails identically every time; retrying wastes the
    // caller's request and can look like abuse.
    expect(isRetryable(422, undefined)).toBe(false)
    expect(isRetryable(400, undefined)).toBe(false)
    expect(isRetryable(403, undefined)).toBe(false)
  })

  it('retries a failure with no status at all', () => {
    // No status means it never reached Resend: DNS, socket, timeout.
    expect(isRetryable(undefined, new Error('ECONNRESET'))).toBe(true)
  })
})

describe('withRetry', () => {
  it('returns immediately on success without sleeping', async () => {
    const clock = fakeClock()
    const { outcome, attempts } = await withRetry(
      outcomes({ ok: true, value: 'id_1', retryable: false }),
      POLICY,
      clock.sleep,
      clock.now,
    )
    expect(outcome.ok).toBe(true)
    expect(attempts).toBe(1)
    expect(clock.slept).toEqual([])
  })

  it('gives up at once on a non-retryable failure', async () => {
    const clock = fakeClock()
    const { attempts } = await withRetry(
      outcomes({ ok: false, error: 'invalid address', retryable: false }),
      POLICY,
      clock.sleep,
      clock.now,
    )
    expect(attempts).toBe(1)
    expect(clock.slept).toEqual([])
  })

  it('retries transient failures and succeeds', async () => {
    const clock = fakeClock()
    const { outcome, attempts } = await withRetry(
      outcomes(
        { ok: false, error: '503', retryable: true },
        { ok: true, value: 'id_2', retryable: false },
      ),
      POLICY,
      clock.sleep,
      clock.now,
    )
    expect(outcome.ok).toBe(true)
    expect(attempts).toBe(2)
    expect(clock.slept).toEqual([100])
  })

  it('backs off exponentially and stops at the attempt limit', async () => {
    const clock = fakeClock()
    const { outcome, attempts } = await withRetry(
      outcomes({ ok: false, error: '500', retryable: true }),
      POLICY,
      clock.sleep,
      clock.now,
    )
    expect(outcome.ok).toBe(false)
    expect(attempts).toBe(3)
    expect(clock.slept).toEqual([100, 200])
  })

  it('never sleeps when even the first delay exceeds the budget', async () => {
    // The point of the budget: the caller's request is waiting on this. Sleeping
    // only to abandon the sequence afterwards delays it for nothing.
    const clock = fakeClock()
    const tight = { attempts: 5, baseDelayMs: 1_000, budgetMs: 500 }
    const { attempts } = await withRetry(
      outcomes({ ok: false, error: '500', retryable: true }),
      tight,
      clock.sleep,
      clock.now,
    )
    expect(attempts).toBe(1)
    expect(clock.slept).toEqual([])
  })

  it('truncates the sequence well short of the attempt limit', async () => {
    const clock = fakeClock()
    const tight = { attempts: 5, baseDelayMs: 1_000, budgetMs: 1_500 }
    const { attempts } = await withRetry(
      outcomes({ ok: false, error: '500', retryable: true }),
      tight,
      clock.sleep,
      clock.now,
    )
    // The first 1s delay fits inside 1.5s; the second (2s) does not. So it
    // stops at two attempts rather than the five the policy would allow.
    expect(attempts).toBe(2)
    expect(clock.slept).toEqual([1_000])
  })

  it('counts time spent inside the attempts against the budget', async () => {
    const clock = fakeClock()
    const slowPolicy = { attempts: 4, baseDelayMs: 100, budgetMs: 1_000 }
    const attempt = () => {
      clock.advance(400) // each call is slow
      return Promise.resolve<AttemptOutcome<string>>({
        ok: false,
        error: '500',
        retryable: true,
      })
    }
    const { attempts } = await withRetry(attempt, slowPolicy, clock.sleep, clock.now)
    // Two slow attempts consume 900ms of the 1s budget, so the third delay is
    // refused - a policy that only counted sleeping would have run all four.
    expect(attempts).toBe(2)
    expect(clock.slept).toEqual([100])
  })
})
