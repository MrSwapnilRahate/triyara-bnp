import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { adminOpenApiDocument } from '@/lib/admin-openapi'
import { route } from '@/lib/api'

// GET /api/v1/openapi.json - machine-readable description of this API.
// Authenticated: the document describes internal endpoints and is not public.
export function GET(req: Request) {
  return route(req, async () => {
    await requireAuth()
    return NextResponse.json(adminOpenApiDocument, {
      headers: { 'cache-control': 'public, max-age=300' },
    })
  })
}
