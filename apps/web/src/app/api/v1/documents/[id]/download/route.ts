import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { getRequestId } from '@/lib/api'
import { documentService } from '@/lib/document-service'

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
  } catch {
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
