export interface RateLimiter {
  check(key: string): { allowed: boolean; remaining: number; resetAt: number }
}

// In-memory sliding-window limiter. Fine for a single instance / dev; swap for a
// Redis-backed limiter (TRY-BNP-TDR-01) in multi-instance production.
export function createInMemoryRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    check(key: string) {
      const now = Date.now()
      const windowStart = now - windowMs
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart)
      recent.push(now)
      hits.set(key, recent)
      const allowed = recent.length <= limit
      return { allowed, remaining: Math.max(0, limit - recent.length), resetAt: now + windowMs }
    },
  }
}
