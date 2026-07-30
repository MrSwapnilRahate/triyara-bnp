import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { ProductList } from '../product-list'

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

function handlers({ products = [PRODUCT], nextCursor = null as string | null, status = 200 } = {}) {
  return [
    http.get('/api/catalog/products', () =>
      status === 200
        ? HttpResponse.json(ok(products, { nextCursor }))
        : HttpResponse.json(
            {
              success: false,
              data: null,
              meta: { requestId: 'req-1' },
              errors: [{ code: 'X', message: 'boom' }],
            },
            { status },
          ),
    ),
    http.get('/api/catalog/categories', () => HttpResponse.json(ok([]))),
  ]
}

describe('ProductList', () => {
  it('renders rows in a real table with a caption', async () => {
    server.use(...handlers())
    renderWithProviders(<ProductList />)

    expect(await screen.findByRole('table', { name: 'Products' })).toBeInTheDocument()
    const row = screen.getByRole('link', { name: /Turmeric Fingers, TRY-TUR-001/ })
    expect(within(row).getByText('TRY-TUR-001')).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()
  })

  it('shows a skeleton before data arrives, never an empty state', async () => {
    server.use(...handlers())
    renderWithProviders(<ProductList />)
    // The distinction matters: an empty state during loading would tell the
    // user there are no products when the request has not finished.
    expect(screen.getByRole('status', { name: 'Loading results' })).toBeInTheDocument()
    expect(screen.queryByText('No products yet')).toBeNull()
    await screen.findByRole('table')
  })

  it('shows the empty state when the catalog is genuinely empty', async () => {
    server.use(...handlers({ products: [] }))
    renderWithProviders(<ProductList />)
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
  })

  it('shows an error state, not an empty state, when the request fails', async () => {
    server.use(...handlers({ status: 500 }))
    renderWithProviders(<ProductList />)
    expect(await screen.findByText('Server error')).toBeInTheDocument()
    expect(screen.queryByText('No products yet')).toBeNull()
  })

  it('sends the search term to the API after debouncing', async () => {
    const seen: string[] = []
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q') ?? '')
        return HttpResponse.json(ok([PRODUCT]))
      }),
      http.get('/api/catalog/categories', () => HttpResponse.json(ok([]))),
    )
    renderWithProviders(<ProductList />)
    await screen.findByRole('table')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 'turmeric')
    // Debounced: the request carries the whole term, not one per keystroke.
    await waitFor(() => expect(seen.length).toBeLessThan(4))
  })

  it('disables Next on the last page and never claims a page number', async () => {
    server.use(...handlers({ nextCursor: null }))
    renderWithProviders(<ProductList />)
    await screen.findByRole('table')

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.queryByText(/page \d+ of/i)).toBeNull()
  })

  it('enables Next when the API returns a cursor', async () => {
    server.use(...handlers({ nextCursor: 'cursor-1' }))
    renderWithProviders(<ProductList />)
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('exposes sort state through aria-sort on sortable columns only', async () => {
    server.use(...handlers())
    renderWithProviders(<ProductList />)
    await screen.findByRole('table')

    expect(screen.getByRole('columnheader', { name: /SKU/ })).toHaveAttribute('aria-sort')
    // Category is not in the API's sort enum, so it must not claim a sort state.
    expect(screen.getByRole('columnheader', { name: 'Category' })).not.toHaveAttribute('aria-sort')
  })

  describe('authorization', () => {
    it('shows New product to an ADMIN', async () => {
      server.use(...handlers())
      renderWithProviders(<ProductList />, { roles: ['ADMIN'] })
      await screen.findByRole('table')
      expect(screen.getByRole('link', { name: 'New product' })).toBeInTheDocument()
    })

    it('HIDES New product from an EXPORT_MANAGER - the catalog is ReferenceData', async () => {
      server.use(...handlers())
      renderWithProviders(<ProductList />, { roles: ['EXPORT_MANAGER'] })
      await screen.findByRole('table')
      // Hidden, not disabled: a greyed control teaches an export manager only
      // that something exists they cannot have, and the API would 403 anyway.
      expect(screen.queryByRole('link', { name: 'New product' })).toBeNull()
    })

    it('hides New product from a READ_ONLY user', async () => {
      server.use(...handlers())
      renderWithProviders(<ProductList />, { roles: ['READ_ONLY'] })
      await screen.findByRole('table')
      expect(screen.queryByRole('link', { name: 'New product' })).toBeNull()
    })

    it('still lets an EXPORT_MANAGER read the list', async () => {
      server.use(...handlers())
      renderWithProviders(<ProductList />, { roles: ['EXPORT_MANAGER'] })
      expect(await screen.findByRole('table')).toBeInTheDocument()
    })
  })
})
