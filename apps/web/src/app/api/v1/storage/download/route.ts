import { Readable } from 'node:stream'

import { getLocalStorage } from '@triyara/storage'

import { getRequestId } from '@/lib/api'
import { logServerError, pathOf } from '@/lib/error-log'

// Token-authed local download (mirrors an S3 presigned GET).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get('key') ?? ''
  const exp = url.searchParams.get('exp') ?? ''
  const sig = url.searchParams.get('sig') ?? ''
  const local = getLocalStorage()
  if (!local.verifyDownload({ key, exp, sig })) return new Response('Forbidden', { status: 403 })

  try {
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
  } catch (error) {
    // `stat` and `readStream` both touch the filesystem. Opening the stream
    // throws synchronously if the file vanished between the two, and that used
    // to escape the handler entirely.
    logServerError(error, {
      requestId: getRequestId(req),
      method: req.method,
      path: pathOf(req.url),
      source: 'storage',
    })
    return new Response('Download failed', { status: 500 })
  }
}
