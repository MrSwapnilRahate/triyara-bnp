// Cross-origin access for the PUBLIC intake endpoint (TRY-BNP-QR-01).
//
// The marketing site and the portal are different origins, so the Request Quote
// form's POST is cross-origin and the browser will not send it without these
// headers. Nothing else on the platform needs them: every other endpoint is
// called by the portal's own pages, which are same-origin.
//
// An ALLOWLIST, never `*`. Two reasons, and the second is the one that matters:
//
//   - `*` would let any site on the internet post enquiries into the queue.
//   - `*` is incompatible with credentials, and quietly relying on that as a
//     safety net is how a later change that does send credentials becomes a
//     CSRF hole. The allowlist means the answer does not depend on that.
//
// The reflected origin is only ever one already on the list - never the caller's
// header echoed back, which would defeat the point entirely.

/** Marketing origins permitted to submit enquiries. */
const DEFAULT_ORIGINS = ['https://www.triyaraexports.com', 'https://triyaraexports.com'] as const

function allowedOrigins(): string[] {
  const configured = process.env.PUBLIC_INTAKE_ALLOWED_ORIGINS
  if (!configured) return [...DEFAULT_ORIGINS]
  return configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/**
 * CORS headers for a request, or none at all when the origin is not permitted.
 *
 * Returning nothing rather than throwing is deliberate: an unlisted origin gets
 * a normal response with no CORS headers, and the browser refuses it. That is
 * the correct failure - it does not tell the caller whether the endpoint exists,
 * and it leaves server-to-server callers (which have no Origin) unaffected.
 */
export function publicCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins().includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // The reflected origin varies by caller, so caches must key on it.
    Vary: 'Origin',
  }
}

/** Preflight response. 204 with the headers, or 204 with none if not allowed. */
export function publicCorsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: publicCorsHeaders(req) })
}
