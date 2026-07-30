import { NextResponse } from 'next/server'

import { requireAuth } from '@/auth/context'
import { route } from '@/lib/api'
import { supplierOpenApiDocument } from '@/lib/supplier-openapi'

// GET /api/suppliers/openapi.json - machine-readable description of this API.
// Authenticated: the document describes internal endpoints and is not public.
export function GET(req: Request) {
  return route(req, async () => {
    await requireAuth()
    return NextResponse.json(supplierOpenApiDocument, {
      headers: { 'cache-control': 'public, max-age=300' },
    })
  })
}
