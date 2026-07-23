import { Readable } from 'node:stream'

import { getLocalStorage } from '@triyara/storage'

// Token-authed local download (mirrors an S3 presigned GET).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get('key') ?? ''
  const exp = url.searchParams.get('exp') ?? ''
  const sig = url.searchParams.get('sig') ?? ''
  const local = getLocalStorage()
  if (!local.verifyDownload({ key, exp, sig })) return new Response('Forbidden', { status: 403 })

  const stat = await local.stat(key)
  if (!stat) return new Response('Not found', { status: 404 })

  const name = url.searchParams.get('name') ?? 'download'
  const ct = url.searchParams.get('ct') ?? 'application/octet-stream'
  const disp = url.searchParams.get('disp') === 'inline' ? 'inline' : 'attachment'

  const webStream = Readable.toWeb(local.readStream(key)) as unknown as ReadableStream<Uint8Array>
  return new Response(webStream, {
    headers: {
      'content-type': ct,
      'content-disposition': `${disp}; filename="${name}"`,
      'content-length': String(stat.size),
    },
  })
}
