import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { errorResponse, getRequestId } from '@/lib/api'
import { documentService } from '@/lib/document-service'
import { isUnexpected, pathOf } from '@/lib/error-log'

type Params = { params: Promise<{ id: string }> }

// Returns a 302 to a short-lived signed URL (local storage route or S3/R2 presigned).
export async function GET(req: Request, { params }: Params) {
  const requestId = getRequestId(req)
  try {
    const auth = await requireAuth()
    const { id } = await params
    const disposition =
      new URL(req.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    const url = await documentService.fileUrl({ ...auth, requestId }, id, disposition)
    return NextResponse.redirect(new URL(url, req.url), 302)
  } catch (error) {
    // A bare `catch` used to answer 404 for everything, so a storage outage or
    // a bad credential told the caller their document did not exist and wrote
    // nothing anywhere. Only our own failures change: 5xx is now reported and
    // logged as one.
    if (isUnexpected(error)) {
      return errorResponse(error, requestId, {
        method: req.method,
        path: pathOf(req.url),
        source: 'storage',
      })
    }
    // 4xx keeps the flattening deliberately. The service raises Forbidden when
    // ability check fails and NotFound for another tenant's document;
    // answering 404 to both is what stops the response distinguishing "not
    // yours" from "does not exist".
    return NextResponse.json(
      {
        success: false,
        data: null,
        meta: { requestId },
        errors: [{ code: 'NOT_FOUND', message: 'Not available' }],
      },
      { status: 404 },
    )
  }
}
