import { screen } from '@testing-library/react'
import type * as TriyaraAuth from '@triyara/auth'
import type { AppAbility } from '@triyara/auth'
import { buildAbilityFor, type Role } from '@triyara/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

/**
 * Which subject each screen asks about.
 *
 * G5.2 and G5.3 gave RFQs, quotations, products and categories their own
 * backend subjects; the client kept asking for the proxies those migrations
 * replaced - `Account` for RFQ and quotation controls, `ReferenceData` for the
 * catalogue.
 *
 * Nothing observable changed, and that is the whole difficulty: every
 * configured role answers identically for old and new subject at every action
 * used here, so a role-based test cannot see the migration at all. That is why
 * these build actors whose permissions deliberately differ between the two -
 * the only way to observe which question a screen actually asks.
 *
 * The client ability is advisory. The services are the boundary and were
 * already migrated; these screens were showing and hiding controls on the
 * strength of an unrelated permission.
 */

/** Set per test; the mock below hands it to whichever component renders. */
let injected: Pick<AppAbility, 'can'> | null = null

/**
 * Substituted at the point the ability is BUILT, not where it is read.
 *
 * `AbilityProvider` calls `buildAbilityFor`, and `<Can>` resolves `useAbility`
 * inside its own module - so stubbing the hook leaves `<Can>` on the real one
 * and the controls render regardless. Replacing the builder instead keeps the
 * real provider, the real context and the real `<Can>` in the chain, and only
 * the rules change.
 */
const INJECT: Role = '__INJECTED__' as Role

vi.mock('@triyara/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof TriyaraAuth>()
  return {
    ...actual,
    buildAbilityFor: (roles: string[]) =>
      injected && roles[0] === '__INJECTED__' ? injected : actual.buildAbilityFor(roles as never),
  }
})

const { ProductList } = await import('../catalog/components/product-list')
const { CategoryTree } = await import('../catalog/components/category-tree')
const { RfqList } = await import('../rfqs/components/rfq-list')
const { QuotationList } = await import('../quotations/components/quotation-list')
const { SupplierList } = await import('../suppliers/components/supplier-list')

/** An actor holding every action on exactly the subjects named. */
const holding = (...subjects: string[]): Pick<AppAbility, 'can'> => ({
  can: ((_action: string, subject: string) => subjects.includes(subject)) as AppAbility['can'],
})

beforeEach(() => {
  injected = null
})

// ---------------------------------------------------------------- catalogue

const PRODUCT = {
  id: 'p1',
  sku: 'TRY-TUR-001',
  name: 'Turmeric Fingers',
  slug: 'turmeric-fingers',
  status: 'ACTIVE',
  brand: 'Triyara',
  countryOfOrigin: 'IN',
  hsCode: '091030',
  isActive: true,
  categoryId: 'c1',
  category: { id: 'c1', name: 'Spices', path: '/spices' },
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

const CATEGORY = {
  id: 'c1',
  name: 'Spices',
  slug: 'spices',
  path: '/spices',
  parentId: null,
  sortOrder: 0,
  isActive: true,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

const catalogueHandlers = () =>
  server.use(
    http.get('/api/catalog/products', () => HttpResponse.json(ok([PRODUCT], { nextCursor: null }))),
    http.get('/api/catalog/categories', () =>
      HttpResponse.json(ok([CATEGORY], { nextCursor: null })),
    ),
  )

describe('the product catalogue asks for Product, not ReferenceData', () => {
  const NEW_PRODUCT = /new product/i

  it('offers the create control to an actor holding Product', async () => {
    // No configured role has this shape: it holds the catalogue without
    // holding reference data. Under the old check it would have been refused.
    injected = holding('Product')
    catalogueHandlers()
    renderWithProviders(<ProductList />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: NEW_PRODUCT })).toBeInTheDocument()
  })

  it('refuses the create control to an actor holding only ReferenceData', async () => {
    // The regression this guards: editing the tag vocabulary used to carry the
    // right to add a product with it.
    injected = holding('ReferenceData')
    catalogueHandlers()
    renderWithProviders(<ProductList />, { roles: [INJECT] })

    await screen.findByText(PRODUCT.name)
    expect(screen.queryByRole('link', { name: NEW_PRODUCT })).not.toBeInTheDocument()
  })

  it('does not let Category permission carry the product catalogue with it', async () => {
    injected = holding('Category')
    catalogueHandlers()
    renderWithProviders(<ProductList />, { roles: [INJECT] })

    await screen.findByText(PRODUCT.name)
    expect(screen.queryByRole('link', { name: NEW_PRODUCT })).not.toBeInTheDocument()
  })
})

describe('the category tree asks for Category, not ReferenceData', () => {
  const NEW_CATEGORY = /new category/i

  it('offers the create control to an actor holding Category', async () => {
    injected = holding('Category')
    catalogueHandlers()
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: NEW_CATEGORY })).toBeInTheDocument()
  })

  it('refuses the create control to an actor holding only ReferenceData', async () => {
    injected = holding('ReferenceData')
    catalogueHandlers()
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    await screen.findByText(CATEGORY.name)
    expect(screen.queryByRole('link', { name: NEW_CATEGORY })).not.toBeInTheDocument()
  })

  it('does not let Product permission carry the category tree with it', async () => {
    // Product and Category are separate subjects, and this is the shape that
    // proves the screens do not share one.
    injected = holding('Product')
    catalogueHandlers()
    renderWithProviders(<CategoryTree />, { roles: [INJECT] })

    await screen.findByText(CATEGORY.name)
    expect(screen.queryByRole('link', { name: NEW_CATEGORY })).not.toBeInTheDocument()
  })
})

// --------------------------------------------------------------------- RFQ

const RFQ_ROW = {
  id: 'r1',
  rfqNumber: 'RFQ-2026-0001',
  title: 'Turmeric, 20MT',
  type: 'INTERNAL',
  status: 'DRAFT',
  priority: 'NORMAL',
  buyerId: null,
  buyer: null,
  responseDeadline: null,
  targetShipmentDate: null,
  itemCount: 1,
  participationCount: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

describe('the RFQ list asks for RFQ, not Account', () => {
  const NEW_RFQ = /new rfq/i
  const handlers = () =>
    server.use(http.get('/api/rfqs', () => HttpResponse.json(ok([RFQ_ROW], { nextCursor: null }))))

  it('offers the create control to an actor holding RFQ', async () => {
    injected = holding('RFQ')
    handlers()
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: NEW_RFQ })).toBeInTheDocument()
  })

  it('refuses the create control to an actor holding only Account', async () => {
    // The regression this guards: "may edit a customer record" used to be the
    // same permission as "may raise an RFQ".
    injected = holding('Account')
    handlers()
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await screen.findByText(RFQ_ROW.rfqNumber)
    expect(screen.queryByRole('link', { name: NEW_RFQ })).not.toBeInTheDocument()
  })

  it('does not let Quotation permission carry the RFQ list with it', async () => {
    injected = holding('Quotation')
    handlers()
    renderWithProviders(<RfqList />, { roles: [INJECT] })

    await screen.findByText(RFQ_ROW.rfqNumber)
    expect(screen.queryByRole('link', { name: NEW_RFQ })).not.toBeInTheDocument()
  })
})

// --------------------------------------------------------------- Quotation

const QUOTATION_ROW = {
  id: 'q1',
  quotationNumber: 'QT-2026-0001',
  title: 'Turmeric offer',
  type: 'FIRM',
  status: 'DRAFT',
  buyerId: 'a1',
  buyer: { id: 'a1', legalName: 'Acme Foods' },
  currency: 'USD',
  grandTotal: '1000.00',
  validUntil: '2026-12-01T00:00:00.000Z',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

describe('the quotation list asks for Quotation, not Account', () => {
  const NEW_QUOTATION = /new quotation/i
  const handlers = () =>
    server.use(
      http.get('/api/quotations', () =>
        HttpResponse.json(ok([QUOTATION_ROW], { nextCursor: null })),
      ),
    )

  it('offers the create control to an actor holding Quotation', async () => {
    injected = holding('Quotation')
    handlers()
    renderWithProviders(<QuotationList />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: NEW_QUOTATION })).toBeInTheDocument()
  })

  it('refuses the create control to an actor holding only Account', async () => {
    injected = holding('Account')
    handlers()
    renderWithProviders(<QuotationList />, { roles: [INJECT] })

    await screen.findByText(QUOTATION_ROW.quotationNumber)
    expect(screen.queryByRole('link', { name: NEW_QUOTATION })).not.toBeInTheDocument()
  })

  it('does not let RFQ permission carry the quotation list with it', async () => {
    injected = holding('RFQ')
    handlers()
    renderWithProviders(<QuotationList />, { roles: [INJECT] })

    await screen.findByText(QUOTATION_ROW.quotationNumber)
    expect(screen.queryByRole('link', { name: NEW_QUOTATION })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------- Supplier

const SUPPLIER_ROW = {
  id: 's1',
  supplierCode: 'SUP-000001',
  companyName: 'Acme Spices',
  legalName: 'Acme Spices Pvt Ltd',
  businessType: 'MANUFACTURER',
  email: 'trade@acme.test',
  phone: null,
  country: 'IN',
  state: 'Kerala',
  city: 'Kochi',
  status: 'APPROVED' as const,
  isVerified: true,
  verifiedAt: null,
  accountId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

describe('the supplier master asks for Supplier, not SupplierProfile', () => {
  const NEW_SUPPLIER = /new supplier/i
  const handlers = () =>
    server.use(
      http.get('/api/suppliers', () => HttpResponse.json(ok([SUPPLIER_ROW], { nextCursor: null }))),
      http.get('/api/suppliers/countries', () => HttpResponse.json(ok([]))),
      http.get('/api/suppliers/certifications', () => HttpResponse.json(ok([]))),
    )

  it('offers the create control to an actor holding Supplier', async () => {
    injected = holding('Supplier')
    handlers()
    renderWithProviders(<SupplierList />, { roles: [INJECT] })

    expect(await screen.findByRole('link', { name: NEW_SUPPLIER })).toBeInTheDocument()
  })

  it('refuses the create control to an actor holding only SupplierProfile', async () => {
    // The regression this guards: the account-attached profile used to be the
    // key to the standalone master record.
    injected = holding('SupplierProfile')
    handlers()
    renderWithProviders(<SupplierList />, { roles: [INJECT] })

    await screen.findByText(SUPPLIER_ROW.supplierCode)
    expect(screen.queryByRole('link', { name: NEW_SUPPLIER })).not.toBeInTheDocument()
  })
})

// ------------------------------------------------- every role is unaffected

describe('every configured role keeps exactly the access it had', () => {
  const ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']

  it.each(ROLES)('gives %s the same answer on the new subject as the old proxy', (role) => {
    // The migration is behaviour-preserving, and this is the assertion that
    // says so for every pair moved. If one ever diverges it has to be a
    // decision somebody made, not something that leaked out of a refactor.
    const a = buildAbilityFor([role])
    const pairs: Array<[string, string, string]> = [
      ['create', 'ReferenceData', 'Product'],
      ['update', 'ReferenceData', 'Product'],
      ['delete', 'ReferenceData', 'Product'],
      ['create', 'ReferenceData', 'Category'],
      ['create', 'Account', 'RFQ'],
      ['update', 'Account', 'RFQ'],
      ['manage', 'Account', 'RFQ'],
      ['create', 'Account', 'Quotation'],
      ['update', 'Account', 'Quotation'],
      ['manage', 'Account', 'Quotation'],
      ['delete', 'Account', 'Quotation'],
      ['read', 'SupplierProfile', 'Supplier'],
      ['create', 'SupplierProfile', 'Supplier'],
      ['update', 'SupplierProfile', 'Supplier'],
      ['delete', 'SupplierProfile', 'Supplier'],
      ['manage', 'SupplierProfile', 'Supplier'],
    ]
    for (const [action, oldSubject, newSubject] of pairs) {
      expect(
        a.can(action as never, newSubject as never),
        `${role} ${action} ${oldSubject} -> ${newSubject}`,
      ).toBe(a.can(action as never, oldSubject as never))
    }
  })

  it('keeps ADMIN as the only writer of the catalogue', () => {
    expect(buildAbilityFor(['ADMIN']).can('create', 'Product')).toBe(true)
    for (const role of ['EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[]) {
      expect(buildAbilityFor([role]).can('create', 'Product'), role).toBe(false)
      expect(buildAbilityFor([role]).can('create', 'Category'), role).toBe(false)
    }
  })

  it('keeps EXPORT_MANAGER able to raise RFQs and quotations but not to award them', () => {
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('update', 'RFQ')).toBe(true)
    expect(em.can('manage', 'RFQ')).toBe(false)
    expect(em.can('create', 'Quotation')).toBe(true)
    expect(em.can('update', 'Quotation')).toBe(true)
    expect(em.can('manage', 'Quotation')).toBe(false)
    expect(em.can('delete', 'Quotation')).toBe(false)
  })

  it('leaves the boundaries the earlier work established alone', () => {
    // G4 security metadata, G5.4 supplier history, G5.5/G5.6 AuditLog.
    const em = buildAbilityFor(['EXPORT_MANAGER'])
    expect(em.can('manage', 'User')).toBe(false)
    expect(em.can('read', 'SupplierProfile')).toBe(true)
    expect(em.can('manage', 'AuditLog')).toBe(false)
    expect(buildAbilityFor(['ADMIN']).can('manage', 'AuditLog')).toBe(true)
    // Genuine reference data stays readable by everyone and ADMIN-writable.
    expect(em.can('read', 'ReferenceData')).toBe(true)
    expect(em.can('create', 'ReferenceData')).toBe(false)
  })
})
