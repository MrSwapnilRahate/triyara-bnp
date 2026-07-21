import { NextResponse } from 'next/server'

// Health check that demonstrates the TRY-BNP-API-01 response envelope.
export function GET() {
  return NextResponse.json({
    success: true,
    data: { status: 'ok', service: 'triyara-bnp-web' },
    meta: { ts: new Date().toISOString() },
    errors: null,
  })
}
