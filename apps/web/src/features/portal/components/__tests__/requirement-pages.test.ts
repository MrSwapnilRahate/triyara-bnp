import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * How the two requirement pages are allowed to reach data.
 *
 * Source-level for the reason earlier batches established: a page that queried
 * a repository itself, or that accepted a `searchParams`, would type-check and
 * render identically while skipping everything `resolve` does between the
 * session and the data. None of that is visible in rendered output.
 */

const APP = join(__dirname, '../../../../app/(portal)/portal/requirements')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const listPage = strip(readFileSync(join(APP, 'page.tsx'), 'utf8'))
const newPage = strip(readFileSync(join(APP, 'new/page.tsx'), 'utf8'))

describe('the requirements list page', () => {
  it('establishes a session before anything else', () => {
    expect(listPage).toContain('requireAuth()')
  })

  it('resolves the party before reading', () => {
    expect(listPage).toContain('portalContextService.resolve')
  })

  it('reads both lists through the buyer portal service', () => {
    expect(listPage).toContain('buyerPortalService.listRequirements')
    expect(listPage).toContain('buyerPortalService.listPendingRequirements')
  })

  it('takes no props, so no URL input can choose the account', () => {
    expect(listPage).toContain('export default async function Page()')
    expect(listPage).not.toContain('searchParams')
    expect(listPage).not.toContain('accountId')
  })

  it('imports no repository or database package', () => {
    expect(listPage).not.toContain('@triyara/db')
    expect(listPage).not.toContain('prisma')
  })

  it('is resolved per request', () => {
    expect(listPage).toContain("dynamic = 'force-dynamic'")
  })
})

describe('the new requirement page', () => {
  it('establishes a session', () => {
    expect(newPage).toContain('requireAuth()')
  })

  it('resolves the party, so the form is not offered to someone who cannot use it', () => {
    expect(newPage).toContain('portalContextService.resolve')
  })

  it('takes no props', () => {
    expect(newPage).toContain('export default async function Page()')
    expect(newPage).not.toContain('searchParams')
    expect(newPage).not.toContain('params')
  })

  it('imports no repository or database package', () => {
    expect(newPage).not.toContain('@triyara/db')
    expect(newPage).not.toContain('prisma')
  })

  it('does not reach the RFQ service', () => {
    expect(newPage).not.toContain('rfqService')
    expect(newPage).not.toContain('rfqRepository')
  })

  it('is resolved per request', () => {
    expect(newPage).toContain("dynamic = 'force-dynamic'")
  })
})

describe('the portal never reaches the RFQ write path', () => {
  it('the service wiring hands the portal the intake repository, not the RFQ service', () => {
    const wiring = strip(
      readFileSync(join(__dirname, '../../../../lib/buyer-portal-service.ts'), 'utf8'),
    )
    expect(wiring).toContain('intake: quoteRequestRepository')
    expect(wiring).not.toContain('rfqService')
    expect(wiring).not.toContain('quoteRequestService')
  })
})
