import { getLocalStorage } from '@triyara/storage'

// Token-authed local upload target (mirrors an S3 presigned PUT). No session; the
// short-lived HMAC signature issued by presign authorizes the write.
export async function PUT(req: Request) {
  const url = new URL(req.url)
  const p = {
    key: url.searchParams.get('key') ?? '',
    exp: url.searchParams.get('exp') ?? '',
    mime: url.searchParams.get('mime') ?? '',
    max: url.searchParams.get('max') ?? '',
    sig: url.searchParams.get('sig') ?? '',
  }
  const local = getLocalStorage()
  if (!local.verifyUpload(p)) return new Response('Forbidden', { status: 403 })

  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.byteLength > Number(p.max)) return new Response('Payload too large', { status: 413 })

  await local.write(p.key, buf)
  return Response.json({ ok: true, size: buf.byteLength })
}
