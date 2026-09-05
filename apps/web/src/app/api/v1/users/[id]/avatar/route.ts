import { requireAuth } from '@/auth/context'
import { getRequestId } from '@/lib/api'
import { avatarService } from '@/lib/avatar-service'
import { isUnexpected, logServerError, pathOf } from '@/lib/error-log'

type Params = { params: Promise<{ id: string }> }

/**
 * The type an image really is, from its first bytes.
 *
 * Needed because the response sets `X-Content-Type-Options: nosniff`, so the
 * browser will refuse to render an image sent as the wrong type rather than
 * work it out itself. S3 and R2 give the recorded type back and this is never
 * reached; the local provider writes bare files and cannot, so development
 * would otherwise show a broken image where production is fine - the worst
 * place for a difference to live.
 *
 * Only the three formats the avatar allow-list accepts are recognised. Anything
 * else returns null and is refused rather than guessed at.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/**
 * GET /api/v1/users/[id]/avatar - a colleague's profile photo.
 *
 * WHY THE BYTES COME THROUGH HERE. The app's CSP is `img-src 'self'`, so an
 * `<img>` cannot load from the storage host - not directly, and not through a
 * redirect either, because a redirect's destination has to satisfy the policy
 * too. Same-origin bytes are the only thing that renders, which is what makes
 * this route necessary rather than merely convenient. The bucket stays private;
 * nothing here hands a storage URL or a credential to the browser.
 *
 * WHY THIS IS NOT AN OPEN FILE PROXY. The only thing the caller supplies is a
 * user id. The organization half of the key comes from their session, so a key
 * is only ever addressable inside the caller's own tenant - an id from
 * elsewhere resolves to an object that is not there. No storage key crosses the
 * wire, and no URL is fetched on the caller's behalf.
 *
 * Absent and forbidden are the same 404, deliberately: distinguishing them
 * would turn this into a way to ask whether a given id exists in another
 * organization. The document download route flattens its errors for the same
 * reason.
 */
export async function GET(req: Request, { params }: Params) {
  const requestId = getRequestId(req)
  try {
    const auth = await requireAuth()
    const { id } = await params

    // `stat` before the bytes: it is the cheap call, it carries the checksum the
    // ETag is built from, and a revalidating browser is then answered with 304
    // without the object ever being read.
    const stat = await avatarService.stat({ ...auth, requestId }, id)
    if (!stat) return new Response(null, { status: 404 })

    const tag = `"${stat.checksum}"`
    if (req.headers.get('if-none-match') === tag) {
      return new Response(null, { status: 304, headers: { etag: tag } })
    }

    const object = await avatarService.read({ ...auth, requestId }, id)
    if (!object) return new Response(null, { status: 404 })

    const contentType = object.contentType ?? sniffImageType(object.bytes)
    if (!contentType) return new Response(null, { status: 404 })

    return new Response(object.bytes as unknown as BodyInit, {
      headers: {
        'content-type': contentType,
        'content-length': String(object.bytes.byteLength),
        etag: tag,
        // PRIVATE, never public or shared. The URL is the same for every
        // viewer, so a shared cache keyed on it alone would be able to hand one
        // organization's photo to another. `private` keeps the copy in the one
        // browser that was authorised to fetch it.
        'cache-control': 'private, max-age=300, must-revalidate',
      },
    })
  } catch (error) {
    if (isUnexpected(error)) {
      logServerError(error, {
        requestId,
        method: req.method,
        path: pathOf(req.url),
        source: 'storage',
      })
      return new Response(null, { status: 500 })
    }
    // Unauthenticated included: an image request has no useful error body, and
    // the shape of the failure should not describe the tenancy behind it.
    return new Response(null, { status: 404 })
  }
}
