/**
 * The destination a visitor asked for before they were sent to sign in.
 *
 * The middleware already records it: a signed-out request for
 * `/portal/requirements` arrives at `/login?callbackUrl=…`. Nothing read it, so
 * everyone landed on `/dashboard` and a buyer following a link to one page
 * arrived at another.
 *
 * Returning somebody to where they were going is the easiest open redirect in
 * the book to write by accident, so this accepts one shape only: a path on this
 * site. Anything carrying its own origin is rejected rather than compared -
 * there is no host list to keep correct, and no parser quirk to be wrong about.
 *
 * Server-side, and deliberately the authority. The login form normalises what it
 * finds in the query string, but a form field is caller-controlled and cannot be
 * the thing that decides.
 */
export function safeCallbackPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const value = raw.trim()
  if (!value) return null

  // A path, not a URL. Everything else - `https://evil.com`, `mailto:…`,
  // `javascript:…` - fails here.
  if (!value.startsWith('/')) return null

  // `//evil.com` is protocol-relative and browsers treat it as another site.
  // `/\evil.com` is the same trick: several parsers fold the backslash into a
  // second slash.
  if (value.startsWith('//') || value.startsWith('/\\')) return null

  // A scheme smuggled further along, and control characters or whitespace that
  // could split a header or hide the real target from a reader.
  if (value.includes('://')) return null
  if (/\s/.test(value)) return null
  // Written as a scan rather than a regex: `no-control-regex` exists to catch
  // control characters that got into a pattern by accident, and here they are
  // exactly what is being rejected - so the rule and the intent disagree, and
  // the loop says the same thing without arguing with it.
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return null
  }

  return value
}
