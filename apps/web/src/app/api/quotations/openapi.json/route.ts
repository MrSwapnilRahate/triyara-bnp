import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { route } from '@/lib/api'
import { quotationOpenApiDocument } from '@/lib/quotation-openapi'

// GET /api/quotations/openapi.json - machine-readable description of this API.
// Authenticated: the document describes internal endpoints and is not public.
// Served raw, not enveloped, so Swagger UI and codegen can consume it directly;
// its error responses are still enveloped because it is wrapped in route().
export function GET(req: Request) {
  return route(req, async () => {
    await requireAuth()
    return NextResponse.json(quotationOpenApiDocument, {
      headers: { 'cache-control': 'public, max-age=300' },
    })
  })
}
