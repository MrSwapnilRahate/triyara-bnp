import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import type { BuyerDocumentList, BuyerDocumentView } from '@triyara/core'
import { describe, expect, it } from 'vitest'

import { DocumentList } from '@/features/portal/components/document-list'
import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * The buyer's own documents as they reach the screen.
 *
 * These are the compliance papers the buyer gave us, so the interesting
 * assertions are not about the content but about what is NOT here: no storage
 * key, no checksum, no row id, no staff name, and no way to open the file. A
 * storage key in a payload is a storage key in the DOM whether or not anything
 * renders it, which is why the leakage scan reads the markup rather than the
 * props.
 */

const DOC: BuyerDocumentView = {
  title: 'GST certificate',
  type: 'GST',
  status: 'RECEIVED',
  issuedDate: new Date('2026-01-15'),
  expiryDate: new Date('2027-01-15'),
  fileName: 'gst-certificate.pdf',
  fileSize: 248_512,
  mimeType: 'application/pdf',
  uploadedAt: new Date('2026-02-01'),
}

function renderList(over: Partial<BuyerDocumentList> = {}) {
  const list: BuyerDocumentList = { items: [DOC], hasMore: false, ...over }
  return renderWithProviders(<DocumentList list={list} />, { roles: ['EXTERNAL_PARTY'] })
}

describe('the document list shows the buyer what they sent us', () => {
  it('names each document', () => {
    renderList()
    expect(screen.getByRole('heading', { name: 'GST certificate' })).toBeInTheDocument()
  })

  it('describes the file without offering it', () => {
    renderList()
    expect(screen.getByText(/gst-certificate\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/242\.7 KB/)).toBeInTheDocument()
  })

  it('shows the document type in words', () => {
    renderList({ items: [{ ...DOC, type: 'COMPANY_REGISTRATION' }] })
    expect(screen.getByText('Company registration')).toBeInTheDocument()
  })

  it('leaves an acronym type alone rather than title-casing it', () => {
    // `GST` must not become `Gst`.
    renderList()
    expect(screen.getByText('GST')).toBeInTheDocument()
  })

  it('shows the upload date', () => {
    renderList()
    expect(screen.getByText('1 Feb 2026')).toBeInTheDocument()
  })

  it('shows issued and expiry dates when we hold them', () => {
    renderList()
    expect(screen.getByText('15 Jan 2026')).toBeInTheDocument()
    expect(screen.getByText('15 Jan 2027')).toBeInTheDocument()
  })

  it('omits the date rows we do not hold', () => {
    renderList({ items: [{ ...DOC, issuedDate: null, expiryDate: null }] })
    expect(screen.queryByText('Issued')).not.toBeInTheDocument()
    expect(screen.queryByText('Expires')).not.toBeInTheDocument()
  })

  it('renders every document when there are several', () => {
    renderList({
      items: [DOC, { ...DOC, title: 'IEC certificate', fileName: 'iec.pdf' }],
    })
    expect(screen.getByRole('heading', { name: 'GST certificate' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'IEC certificate' })).toBeInTheDocument()
  })

  it('offers an honest empty state rather than a blank page', () => {
    renderList({ items: [] })
    expect(screen.getByText('No documents yet')).toBeInTheDocument()
  })

  it('says so when more documents exist than are shown', () => {
    renderList({ hasMore: true })
    expect(screen.getByText(/most recent documents/)).toBeInTheDocument()
  })

  it('stays silent about truncation when there is none', () => {
    renderList()
    expect(screen.queryByText(/most recent documents/)).not.toBeInTheDocument()
  })
})

describe('every status a document can hold is shown plainly', () => {
  // All five, because none is hidden from the buyer and the humanising must not
  // mangle any of them.
  it.each([
    ['PENDING', 'Pending'],
    ['RECEIVED', 'Received'],
    ['VERIFIED', 'Verified'],
    ['EXPIRED', 'Expired'],
    ['REJECTED', 'Rejected'],
  ])('renders %s as %s', (status, label) => {
    renderList({ items: [{ ...DOC, status }] })
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('the list is read-only, and the file is not reachable from it', () => {
  it('offers no control that would act on a document', () => {
    renderList()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('offers no link at all — there is no detail route and no download', () => {
    renderList()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

describe('accessibility', () => {
  it('has no violations', async () => {
    const { container } = renderList()
    await expectNoAxeViolations(container)
  })

  it('has no violations when empty', async () => {
    const { container } = renderList({ items: [] })
    await expectNoAxeViolations(container)
  })
})

describe('nothing internal reaches the DOM', () => {
  it('renders no storage key, checksum, row id or staff name even when smuggled in', () => {
    const polluted = {
      ...DOC,
      id: 'doc-internal-id',
      organizationId: 'org-internal-1',
      accountId: 'acct-internal-1',
      supplierProfileId: 'sp-internal-1',
      currentStorageKey: 'org-internal-1/acct-internal-1/uuid/gst-certificate.pdf',
      currentChecksum: 'sha256-9111111111abcdef',
      createdById: 'staff-1',
      updatedById: 'staff-2',
      deletedById: 'staff-3',
      version: 7,
      deletedAt: new Date('2026-03-01'),
    } as unknown as BuyerDocumentView

    const { container } = renderWithProviders(
      <DocumentList list={{ items: [polluted], hasMore: false }} />,
      { roles: ['EXTERNAL_PARTY'] },
    )

    const rendered = container.innerHTML
    for (const leak of [
      'doc-internal-id',
      'org-internal-1',
      'acct-internal-1',
      'sp-internal-1',
      'uuid/gst-certificate.pdf',
      'sha256-9111111111abcdef',
      'staff-1',
      'staff-2',
      'staff-3',
    ]) {
      expect(rendered, `must not render ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * How the page is allowed to reach a buyer's documents.
 *
 * Source-level, for the reason Batch D established: a page that queried the
 * repository itself would type-check and render identically, while skipping
 * everything `resolve` does between the session and the data. None of that is
 * visible in rendered output.
 *
 * The internal `documentService` is named here explicitly because it is the
 * dangerous reuse: its `list` spreads `accountId` conditionally and its
 * `findById` carries no account clause at all, so either would answer with the
 * whole tenant if a portal caller ever reached them.
 */
describe('the documents page reaches data only through the sanctioned path', () => {
  const source = readFileSync(
    join(__dirname, '../../../../app/(portal)/portal/documents/page.tsx'),
    'utf8',
  )
  // Comments stripped, so the check can neither pass nor fail on prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('establishes a session before anything else', () => {
    expect(code).toContain('requireAuth()')
  })

  it('resolves the party before reading anything', () => {
    expect(code).toContain('portalContextService.resolve')
  })

  it('reads through the buyer portal service', () => {
    expect(code).toContain('buyerPortalService.listDocuments')
  })

  it('imports no repository or database package', () => {
    expect(code).not.toContain('@triyara/db')
    expect(code).not.toContain('documentRepository')
    expect(code).not.toContain('prisma')
  })

  it('does not reach the internal CASL-gated document service', () => {
    expect(code).not.toContain('documentService')
  })

  it('takes no props, so no URL input can choose the account', () => {
    expect(code).toContain('export default async function Page()')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('params')
    expect(code).not.toContain('accountId')
  })

  it('is resolved per request rather than cached across sessions', () => {
    expect(code).toContain("dynamic = 'force-dynamic'")
  })
})
