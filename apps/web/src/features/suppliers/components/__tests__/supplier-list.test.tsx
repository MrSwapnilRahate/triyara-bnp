import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierList } from '../supplier-list'

const SUPPLIER = {
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
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
}

function handlers({
  suppliers = [SUPPLIER],
  nextCursor = null as string | null,
  status = 200,
} = {}) {
  return [
    http.get('/api/suppliers', () =>
      status === 200
        ? HttpResponse.json(ok(suppliers, { nextCursor }))
        : HttpResponse.json(
            {
              success: false,
              data: null,
              meta: { requestId: 'r' },
              errors: [{ code: 'X', message: 'boom' }],
            },
            { status },
          ),
    ),
    http.get('/api/suppliers/countries', () =>
      HttpResponse.json(
        ok([
          { country: 'IN', suppliers: 3 },
          { country: 'AE', suppliers: 1 },
        ]),
      ),
    ),
    http.get('/api/suppliers/certifications', () =>
      HttpResponse.json(
        ok([{ type: 'FSSAI', total: 2, active: 1 }], { extra: { vocabulary: ['FSSAI', 'HACCP'] } }),
      ),
    ),
  ]
}

describe('SupplierList', () => {
  it('renders rows in a real table', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierList />)

    expect(await screen.findByRole('table', { name: 'Suppliers' })).toBeInTheDocument()
    const row = screen.getByRole('link', { name: /Acme Spices, SUP-000001/ })
    expect(within(row).getByText('SUP-000001')).toBeInTheDocument()
    expect(within(row).getByText('Kochi, IN')).toBeInTheDocument()
    expect(within(row).getByText('Verified')).toBeInTheDocument()
  })

  it('builds the country filter from the API facets, not a static ISO list', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierList />)
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }))
    const listbox = await screen.findByRole('listbox')
    // Exactly the tenant's countries plus "All" - not 249 mostly-empty options.
    expect(within(listbox).getByText('IN')).toBeInTheDocument()
    expect(within(listbox).getByText('AE')).toBeInTheDocument()
    expect(within(listbox).queryByText('ZW')).toBeNull()
  })

  it('reports how many certification types the tenant holds', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierList />)
    expect(await screen.findByText('1 certification type held')).toBeInTheDocument()
  })

  it('shows the empty state when there are no suppliers', async () => {
    server.use(...handlers({ suppliers: [] }))
    renderWithProviders(<SupplierList />)
    expect(await screen.findByText('No suppliers yet')).toBeInTheDocument()
  })

  it('shows an error state, not an empty state, when the request fails', async () => {
    server.use(...handlers({ status: 500 }))
    renderWithProviders(<SupplierList />)
    expect(await screen.findByText('Server error')).toBeInTheDocument()
    expect(screen.queryByText('No suppliers yet')).toBeNull()
  })

  it('never claims a page number - the API is keyset-paginated', async () => {
    server.use(...handlers({ nextCursor: 'c1' }))
    renderWithProviders(<SupplierList />)
    await screen.findByRole('table')
    expect(screen.queryByText(/page \d+ of/i)).toBeNull()
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  describe('authorization', () => {
    it('shows New supplier to an EXPORT_MANAGER - suppliers are SupplierProfile', async () => {
      server.use(...handlers())
      renderWithProviders(<SupplierList />, { roles: ['EXPORT_MANAGER'] })
      await screen.findByRole('table')
      // Unlike the catalog, an export manager CAN create a supplier.
      expect(screen.getByRole('link', { name: 'New supplier' })).toBeInTheDocument()
    })

    it('hides New supplier from a READ_ONLY user', async () => {
      server.use(...handlers())
      renderWithProviders(<SupplierList />, { roles: ['READ_ONLY'] })
      await screen.findByRole('table')
      expect(screen.queryByRole('link', { name: 'New supplier' })).toBeNull()
    })

    it('hides New supplier from a VERIFIER', async () => {
      server.use(...handlers())
      renderWithProviders(<SupplierList />, { roles: ['VERIFIER'] })
      await screen.findByRole('table')
      expect(screen.queryByRole('link', { name: 'New supplier' })).toBeNull()
    })
  })
})
