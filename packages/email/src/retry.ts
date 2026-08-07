/**
 * Retry policy for transient delivery failures.
 *
 * Sending happens inside the request that triggered it - the event bus awaits
 * its subscribers - so the retry budget is deliberately small. An unbounded
 * backoff would turn a Resend outage into supplier registrations that take a
 * minute to submit. Better to give up quickly, log it, and let the request
 * finish: the registration is already saved by then, and a lost confirmation
 * email is recoverable in a way a lost registration is not.
 */
export interface RetryPolicy {
  /** Total attempts including the first. */
  attempts: number
  /** Delay before the second attempt; doubles thereafter. */
  baseDelayMs: number
  /** Ceiling on the whole sequence, including delays. */
  budgetMs: number
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseDelayMs: 200, budgetMs: 8_000 }

/**
 * Whether a failure is worth trying again.
 *
 * A rejected address or a malformed payload fails identically every time;
 * retrying it wastes the caller's request and, on 4xx, can look like abuse.
 * Rate limiting (429) is the exception - that one is explicitly temporary.
 */
export function isRetryable(status: number | undefined, error: unknown): boolean {
  if (status !== undefined) return status === 429 || status >= 500
  // No status: a network-level failure (DNS, socket, timeout). Those are the
  // transient ones by definition.
  return error !== undefined
}

export interface AttemptOutcome<T> {
  ok: boolean
  value?: T
  error?: string
  retryable: boolean
}

/**
 * Runs `attempt` until it succeeds, stops being retryable, or the budget runs
 * out. Returns the last outcome with the number of attempts made.
 */
export async function withRetry<T>(
  attempt: () => Promise<AttemptOutcome<T>>,
  policy: RetryPolicy = DEFAULT_RETRY,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = () => Date.now(),
): Promise<{ outcome: AttemptOutcome<T>; attempts: number }> {
  const startedAt = now()
  let last: AttemptOutcome<T> = { ok: false, error: 'not attempted', retryable: false }

  for (let made = 1; made <= policy.attempts; made++) {
    last = await attempt()
    if (last.ok || !last.retryable) return { outcome: last, attempts: made }
    if (made === policy.attempts) break

    const delay = policy.baseDelayMs * 2 ** (made - 1)
    // Stop if sleeping would push past the budget - waiting only to abandon
    // the sequence afterwards delays the request for nothing.
    if (now() - startedAt + delay >= policy.budgetMs) {
      return { outcome: last, attempts: made }
    }
    await sleep(delay)
  }

  return { outcome: last, attempts: policy.attempts }
}
