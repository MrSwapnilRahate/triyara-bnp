import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { errorResponse, getRequestId } from '@/lib/api'
import { isUnexpected, pathOf } from '@/lib/error-log'
import { supplierDocumentService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string; documentId: string }> }

// GET /api/suppliers/:id/documents/:documentId/download
//
// Redirects to a short-lived signed URL, exactly as the Document module's
// download does. `?disposition=inline` previews in the browser instead of
// downloading - which is what someone wants for a factory photograph.
export async function GET(req: Request, { params }: Ctx) {
  const requestId = getRequestId(req)
  try {
    const auth = await requireAuth()
    const { id, documentId } = await params
    const disposition =
      new URL(req.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    const url = await supplierDocumentService.fileUrl(
      { ...auth, requestId },
      id,
      documentId,
      disposition,
    )
    return NextResponse.redirect(new URL(url, req.url), 302)
  } catch (error) {
    // See the Document module's download route: a bare `catch` reported every
    // failure, including ours, as a missing document.
    if (isUnexpected(error)) {
      return errorResponse(error, requestId, {
        method: req.method,
        path: pathOf(req.url),
        source: 'storage',
      })
    }
    // 4xx stays flattened so the response cannot distinguish another tenant's
    // document from one that does not exist.
    return NextResponse.json(
      {
        success: false,
        data: null,
        meta: { requestId },
        errors: [{ code: 'NOT_FOUND', message: 'Document not found.' }],
      },
      { status: 404 },
    )
  }
}
