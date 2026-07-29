import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { route } from '@/lib/api'
import { catalogOpenApiDocument } from '@/lib/catalog-openapi'

// GET /api/catalog/openapi.json - machine-readable description of this API.
// Authenticated: the document describes internal endpoints and is not public.
export function GET(req: Request) {
  return route(req, async () => {
    await requireAuth()
    return NextResponse.json(catalogOpenApiDocument, {
      headers: { 'cache-control': 'public, max-age=300' },
    })
  })
}
