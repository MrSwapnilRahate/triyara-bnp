import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as TriyaraAuth from '@triyara/auth'
import type { AppAbility } from '@triyara/auth'
import { buildAbilityFor, type Role } from '@triyara/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

/**
 * Finding and restoring a soft-deleted record.
 *
 * Every one of these lists hid deleted rows with no way to ask for them, while
 * the services had implemented `restore` all along - so the capability existed
 * and no user could reach it. These cover the two halves that make it usable:
 * the record has to be findable, and the row has to offer Restore to the roles
 * the backend actually allows.
 *
 * The restore contract is deliberately uneven, so each list is asserted against
 * its own pair rather than a shared assumption:
 *
 *   RFQ, Supplier   `update`   ADMIN + EXPORTER
 *   Product         `update`   ADMIN only - only ADMIN writes the catalogue
 *   Quotation       `manage`   ADMIN only, stricter than the rest
 */

let injected: Pick<AppAbility, 'can'> | null = null

/**
 * Substituted where the ability is BUILT. `<Can>` resolves `useAbility` inside
 * its own module, so replacing the hook leaves the real one in place and every
 * control renders regardless - the trap an earlier version of this file fell
 * into. Replacing the builder keeps provider, context and `<Can>` all real.
 */
const INJECT: Role = '__INJECTED__' as Role

/**
 * The global setup mocks useSearchParams to an empty set, but the deleted
 * filter lives in the URL - `useListState` reads it from there. Overridden here
 * so a test can start with the filter already applied, which is the state a
 * user reaches by choosing "Shown".
 */
let search = new URLSearchParams()
const nav = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/rfqs',
  useSearchParams: () => search,
}))

vi.mock('@triyara/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof TriyaraAuth>()
  return {
    ...actual,
    buildAbilityFor: (roles: string[]) =>
      injected && roles[0] === '__INJECTED__' ? injected : actual.buildAbilityFor(roles as never),
  }
})

const { RfqList } = await import('../rfqs/components/rfq-list')
const { ProductList } = await import('../catalog/components/product-list')
const { SupplierList } = await import('../suppliers/components/supplier-list')
const { QuotationList } = await import('../quotations/components/quotation-list')
const { CategoryTree } = await import('../catalog/components/category-tree')

const holding = (...subjects: string[]): Pick<AppAbility, 'can'> => ({
  can: ((_a: string, s: string) => subjects.includes(s)) as AppAbility['can'],
})

beforeEach(() => {
  injected = null
  search = new URLSearchParams()
})

const DELETED_AT = '2026-02-01T00:00:00.000Z'
const RESTORE = { name: /^restore$/i }

// ---------------------------------------------------------------------- RFQ

const rfqRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  rfqNumber: 'RFQ-2026-0001',
  title: 'Turmeric, 20MT',
  type: 'INTERNAL',
  status: 'DRAFT',
  priority: 'NORMAL',
  buyerId: null,
  buyer: null,
  responseDeadline: null,
  quotationDeadline: null,
  targetShipmentDate: null,
  destinationPort: null,
  destinationCountry: null,
  itemCount: 1,
  participationCount: 0,
  currentRevision: 1,
  version: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

function rfqHandlers(rows: unknown[], calls: Array<{ url: string; ifMatch: string | null }> = []) {
  server.use(
    http.get('/api/rfqs', ({ request }) => {
      const asked = new URL(request.url).searchParams.get('includeDeleted') === 'true'
      calls.push({ url: request.url, ifMatch: null })
      return HttpResponse.json(
        ok(asked ? rows : rows.filter((r) => !(r as { deletedAt?: string }).deletedAt), {
          nextCursor: null,
        }),
      )
    }),
    http.post('/api/rfqs/r1/restore', ({ request }) => {
      calls.push({ url: request.url, ifMatch: request.headers.get('If-Match') })
      return HttpResponse.json(ok(rfqRow({ deletedAt: null, version: 4 })))
    }),
  )
  return calls
}

describe('deleted records are hidden until asked for', () => {
  it('omits a deleted RFQ from the default list', async () => {
    injected = buildAbilityFor(['ADMIN'])
    rfqHandlers([rfqRow(), rfqRow({ id: 'r2', rfqNumber: 'RFQ-DELETED', deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    expect(await screen.findByText('RFQ-2026-0001')).toBeInTheDocument()
    expect(screen.queryByText('RFQ-DELETED')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })

  it('sends includeDeleted to the API when the filter is set', async () => {
    // The filter is the whole discovery mechanism - the detail route 404s on a
    // deleted record, so there is no other way in. Asserted on the request the
    // list makes rather than by driving the Select, which jsdom renders as a
    // portal the query does not depend on.
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['ADMIN'])
    const calls = rfqHandlers([
      rfqRow({ id: 'r2', rfqNumber: 'RFQ-DELETED', deletedAt: DELETED_AT }),
    ])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    expect(await screen.findByText('RFQ-DELETED')).toBeInTheDocument()
    expect(calls.some((c) => c.url.includes('includeDeleted=true'))).toBe(true)
  })
})

describe('a deleted row does not navigate', () => {
  it('drops the link role so the 404 detail page is unreachable', async () => {
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['ADMIN'])
    rfqHandlers([rfqRow({ deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    const row = await screen.findByLabelText(/RFQ-2026-0001.*deleted/i)
    // Active rows carry role="link"; this one must not, because /rfqs/:id does
    // not accept includeDeleted and would 404.
    expect(row).not.toHaveAttribute('role', 'link')
  })
})

describe('RFQ restore is offered to ADMIN and EXPORTER', () => {
  it.each(['ADMIN', 'EXPORTER'] as Role[])('shows Restore to %s', async (role) => {
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor([role])
    rfqHandlers([rfqRow({ deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    expect(await screen.findByRole('button', RESTORE)).toBeInTheDocument()
  })

  it.each(['VERIFIER', 'READ_ONLY'] as Role[])('hides Restore from %s', async (role) => {
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor([role])
    rfqHandlers([rfqRow({ deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await screen.findByText('RFQ-2026-0001')
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })

  it('asks about RFQ, not a neighbouring subject', async () => {
    // Every configured role answers the same for `update` across RFQ, Product,
    // Supplier and Quotation, so only a hand-built actor can show which subject
    // the control names.
    search = new URLSearchParams('includeDeleted=true')
    injected = holding('Quotation')
    rfqHandlers([rfqRow({ deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await screen.findByText('RFQ-2026-0001')
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })

  it('posts to the restore route with the row version, then reports success', async () => {
    const user = userEvent.setup()
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['ADMIN'])
    const calls = rfqHandlers([rfqRow({ deletedAt: DELETED_AT })])
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await user.click(await screen.findByRole('button', RESTORE))
    await user.click(await screen.findByRole('button', { name: /restore rfq/i }))

    await waitFor(() => {
      const call = calls.find((c) => c.url.endsWith('/restore'))
      expect(call).toBeDefined()
      // If-Match carries the version: a stale tab must lose the race rather
      // than resurrect a record someone else has changed.
      expect(call?.ifMatch).toBe('W/"v3"')
    })
    expect(await screen.findByText(/rfq restored/i)).toBeInTheDocument()
  })

  it('keeps the dialog open and surfaces the reason when the API refuses', async () => {
    const user = userEvent.setup()
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['ADMIN'])
    server.use(
      http.get('/api/rfqs', () =>
        HttpResponse.json(ok([rfqRow({ deletedAt: DELETED_AT })], { nextCursor: null })),
      ),
      http.post('/api/rfqs/r1/restore', () =>
        HttpResponse.json(fail([{ code: 'FORBIDDEN', message: 'Not permitted: update RFQ' }]), {
          status: 403,
        }),
      ),
    )
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await user.click(await screen.findByRole('button', RESTORE))
    await user.click(await screen.findByRole('button', { name: /restore rfq/i }))

    expect(await screen.findByText(/not permitted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restore rfq/i })).toBeInTheDocument()
  })
})

// ------------------------------------------- the catalogue and quotation gates

describe('each list names the subject and action its own backend guard uses', () => {
  const productRow = {
    id: 'p1',
    sku: 'TRY-1',
    name: 'Turmeric',
    slug: 't',
    status: 'ACTIVE',
    brand: null,
    countryOfOrigin: null,
    hsCode: null,
    isActive: true,
    categoryId: 'c1',
    category: { id: 'c1', name: 'Spices', path: '/spices' },
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: DELETED_AT,
  }

  const supplierRow = {
    id: 's1',
    supplierCode: 'SUP-1',
    companyName: 'Acme Spices',
    legalName: 'Acme Pvt',
    businessType: 'MANUFACTURER',
    email: null,
    phone: null,
    country: 'IN',
    state: null,
    city: null,
    status: 'APPROVED' as const,
    isVerified: false,
    verifiedAt: null,
    accountId: null,
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: DELETED_AT,
  }

  const quotationRow = {
    id: 'q1',
    quotationNumber: 'QT-1',
    title: 'Offer',
    type: 'FIRM',
    status: 'DRAFT',
    buyerId: 'a1',
    buyer: { id: 'a1', legalName: 'Acme Foods' },
    currency: 'USD',
    grandTotal: '1000.00',
    validUntil: '2026-12-01T00:00:00.000Z',
    revisionNumber: 1,
    supersededAt: null,
    paymentTermId: null,
    paymentTerm: null,
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: DELETED_AT,
  }

  const catalogue = () =>
    server.use(
      http.get('/api/catalog/products', () =>
        HttpResponse.json(ok([productRow], { nextCursor: null })),
      ),
      http.get('/api/catalog/categories', () => HttpResponse.json(ok([], { nextCursor: null }))),
    )
  const suppliers = () =>
    server.use(
      http.get('/api/suppliers', () => HttpResponse.json(ok([supplierRow], { nextCursor: null }))),
      http.get('/api/suppliers/countries', () => HttpResponse.json(ok([]))),
      http.get('/api/suppliers/certifications', () => HttpResponse.json(ok([]))),
    )
  const quotations = () =>
    server.use(
      http.get('/api/quotations', () =>
        HttpResponse.json(ok([quotationRow], { nextCursor: null })),
      ),
    )

  it('offers product restore to ADMIN but not EXPORTER', async () => {
    search = new URLSearchParams('includeDeleted=true')
    // The catalogue is readable by every role and writable by ADMIN alone, so
    // this is the one place `update` does NOT reach an exporter.
    injected = buildAbilityFor(['ADMIN'])
    catalogue()
    const admin = renderWithProviders(<ProductList />, { roles: [INJECT] })
    expect(await screen.findByRole('button', RESTORE)).toBeInTheDocument()
    admin.unmount()

    injected = buildAbilityFor(['EXPORTER'])
    catalogue()
    renderWithProviders(<ProductList />, { roles: [INJECT] })
    await screen.findByText('Turmeric')
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })

  it('offers supplier restore to EXPORTER', async () => {
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['EXPORTER'])
    suppliers()
    renderWithProviders(<SupplierList />, { roles: [INJECT] })

    expect(await screen.findByRole('button', RESTORE)).toBeInTheDocument()
  })

  it('withholds quotation restore from EXPORTER, which holds update but not manage', async () => {
    search = new URLSearchParams('includeDeleted=true')
    // The sharpest case: an exporter may update a quotation, so a control
    // gated on `update` would appear here. It is gated on `manage`.
    injected = buildAbilityFor(['EXPORTER'])
    quotations()
    renderWithProviders(<QuotationList />, { roles: [INJECT] })

    await screen.findByText('QT-1')
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })

  it('offers quotation restore to ADMIN', async () => {
    search = new URLSearchParams('includeDeleted=true')
    injected = buildAbilityFor(['ADMIN'])
    quotations()
    renderWithProviders(<QuotationList />, { roles: [INJECT] })

    expect(await screen.findByRole('button', RESTORE)).toBeInTheDocument()
  })
})

// ----------------------------------------------------------------- Category

describe('deleted categories appear inline in the tree', () => {
  const cat = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Spices',
    slug: 'spices',
    description: null,
    parentId: null,
    path: '/spices',
    depth: 0,
    sortOrder: 0,
    isActive: true,
    version: 2,
    deletedAt: null,
    ...over,
  })

  const restoreCalls: Array<{ ifMatch: string | null }> = []

  const tree = (rows: unknown[]) =>
    server.use(
      http.get('/api/catalog/categories', ({ request }) => {
        // The tree always asks for deleted rows - there is no filter, by design.
        expect(new URL(request.url).searchParams.get('includeDeleted')).toBe('true')
        return HttpResponse.json(ok(rows, { nextCursor: null }))
      }),
      http.post('/api/catalog/categories/c1/restore', ({ request }) => {
        restoreCalls.push({ ifMatch: request.headers.get('If-Match') })
        return HttpResponse.json(ok(cat({ deletedAt: null, version: 3 })))
      }),
    )

  it('shows a deleted category, struck through and not as a link', async () => {
    search = new URLSearchParams()
    injected = buildAbilityFor(['ADMIN'])
    tree([cat({ deletedAt: DELETED_AT })])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    const name = await screen.findByText('Spices')
    expect(name.className).toContain('line-through')
    // An active category links to its filtered product list; a deleted one
    // filters to nothing, so it must not be a link.
    expect(screen.queryByRole('link', { name: 'Spices' })).not.toBeInTheDocument()
  })

  it('keeps an active category a link', async () => {
    search = new URLSearchParams()
    injected = buildAbilityFor(['ADMIN'])
    tree([cat()])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: 'Spices' })).toBeInTheDocument()
  })

  it('keeps a live child nested under a deleted parent', async () => {
    // The reason deleted parents are fetched rather than hidden:
    // buildCategoryTree treats a node whose parent is absent as a ROOT, so
    // hiding the parent would silently promote the child to the top level.
    search = new URLSearchParams()
    injected = buildAbilityFor(['ADMIN'])
    tree([
      cat({ deletedAt: DELETED_AT }),
      cat({ id: 'c2', name: 'Turmeric', parentId: 'c1', path: '/spices/turmeric', depth: 1 }),
    ])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    const user = userEvent.setup()
    await screen.findByText('Spices')
    // Collapsed by default, so the child only renders once the deleted parent
    // is expanded - which is itself the point: it is still a parent.
    await user.click(screen.getByRole('button', { name: /expand spices/i }))

    // The child sits inside the parent's group, not beside it at the root.
    const group = await screen.findByRole('group')
    expect(group).toHaveTextContent('Turmeric')
  })

  it('offers Restore to ADMIN', async () => {
    search = new URLSearchParams()
    injected = buildAbilityFor(['ADMIN'])
    tree([cat({ deletedAt: DELETED_AT })])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    expect(await screen.findByRole('button', RESTORE)).toBeInTheDocument()
  })

  it('posts with the node version so a stale tree cannot resurrect it', async () => {
    const user = userEvent.setup()
    search = new URLSearchParams()
    injected = buildAbilityFor(['ADMIN'])
    restoreCalls.length = 0
    tree([cat({ deletedAt: DELETED_AT })])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    await user.click(await screen.findByRole('button', RESTORE))
    await user.click(await screen.findByRole('button', { name: /restore category/i }))

    await waitFor(() => expect(restoreCalls).toHaveLength(1))
    expect(restoreCalls[0]?.ifMatch).toBe('W/"v2"')
  })

  it.each(['EXPORTER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    'withholds Restore from %s',
    async (role) => {
      // The catalogue is readable by every role and writable by ADMIN alone,
      // so even an exporter sees the deleted category but cannot act.
      search = new URLSearchParams()
      injected = buildAbilityFor([role])
      tree([cat({ deletedAt: DELETED_AT })])
      renderWithProviders(<CategoryTree />, { roles: [INJECT] })

      await screen.findByText('Spices')
      expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
    },
  )

  it('asks about Category, not a neighbouring catalogue subject', async () => {
    search = new URLSearchParams()
    injected = holding('Product')
    tree([cat({ deletedAt: DELETED_AT })])
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    await screen.findByText('Spices')
    expect(screen.queryByRole('button', RESTORE)).not.toBeInTheDocument()
  })
})
