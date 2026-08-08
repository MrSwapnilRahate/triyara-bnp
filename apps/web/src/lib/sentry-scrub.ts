/**
 * What must never leave the building.
 *
 * The Sentry SDK attaches a request to server events on its own, and by default
 * that includes headers and cookies. `sendDefaultPii: false` already declines
 * most of it, but the option is a setting - one that a future edit could flip
 * without anyone noticing what it turns on. This strips the fields outright, so
 * the guarantee survives a configuration mistake.
 *
 * Kept as a pure function over the event rather than inline in three `init`
 * calls: server, edge and browser must scrub identically, and a policy written
 * three times is a policy that will differ in one of them.
 */

/** The subset of a Sentry event this touches. Structural, so no SDK import. */
export interface ScrubbableEvent {
  request?: {
    url?: string
    method?: string
    headers?: Record<string, string>
    cookies?: unknown
    data?: unknown
    query_string?: unknown
  }
  user?: { id?: string; ip_address?: string; email?: string; username?: string }
  contexts?: Record<string, unknown>
  extra?: Record<string, unknown>
}

/**
 * Headers worth keeping. An allow-list, not a deny-list: a deny-list has to
 * predict every header a proxy might add, and it only takes one it did not
 * predict. `authorization` and `cookie` are the two that matter, and neither is
 * on this list.
 */
const KEPT_HEADERS = new Set(['content-type', 'user-agent', 'referer', 'x-request-id'])

/** Keys whose value is a credential regardless of where it appears. */
const SECRET_KEY = /pass(word)?|token|secret|api[-_]?key|authorization|cookie|credential|otp/i

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request
  if (request) {
    // The body. A supplier's uploaded document, a password on its way to be
    // changed, and every registration form live here.
    delete request.data
    delete request.cookies
    delete request.query_string

    // `?q=` on supplier search carries whatever the user typed, exactly as in
    // the logger. The path identifies the endpoint; the query would only add
    // the part we are not allowed to keep.
    if (request.url) request.url = stripQuery(request.url)

    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
      )
    }
  }

  if (event.user) {
    // The id is what correlates an event with a person in our own database.
    // The address and the name are not needed to do that, and the IP is
    // personal data we have no reason to ship abroad.
    delete event.user.ip_address
    delete event.user.email
    delete event.user.username
  }

  if (event.extra) event.extra = redactSecrets(event.extra) as Record<string, unknown>
  if (event.contexts) event.contexts = redactSecrets(event.contexts) as Record<string, unknown>

  return event
}

function stripQuery(url: string): string {
  const cut = url.indexOf('?')
  return cut === -1 ? url : url.slice(0, cut)
}

/**
 * Replaces anything that looks like a credential, at any depth.
 *
 * Bounded at five levels and skipping anything already seen: `contexts` is
 * assembled by the SDK from objects we do not control, and a cycle here would
 * hang the process inside error reporting, which is the worst possible place
 * to hang.
 */
function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 5 || typeof value !== 'object' || value === null) return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1, seen))

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(val, depth + 1, seen),
    ]),
  )
}
