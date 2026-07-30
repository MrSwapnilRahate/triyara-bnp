import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { ProductForm } from '../product-form'

const CATEGORIES = [
  {
    id: 'c1',
    name: 'Spices',
    slug: 'spices',
    description: null,
    parentId: null,
    path: '/spices',
    depth: 0,
    sortOrder: 0,
    isActive: true,
    version: 1,
  },
]

function categoryHandler() {
  return http.get('/api/catalog/categories', () => HttpResponse.json(ok(CATEGORIES)))
}

/**
 * The action buttons live in the PageHeader and reference the form with
 * `form="product-form"`. That association is standard HTML and works in a
 * browser, but jsdom does not implement it for a submit button outside the
 * form - so these tests submit the form element itself. The button wiring is
 * verified in the browser instead.
 */
function submitForm() {
  const form = document.getElementById('product-form')
  if (!form) throw new Error('product-form not found')
  fireEvent.submit(form)
}

const PRODUCT = {
  id: 'p1',
  sku: 'TRY-TUR-001',
  name: 'Turmeric',
  slug: 'turmeric',
  status: 'ACTIVE' as const,
  brand: null,
  countryOfOrigin: null,
  hsCode: null,
  isActive: true,
  categoryId: 'c1',
  version: 3,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  shortDescription: null,
  description: null,
  specifications: [],
  tags: [],
}

describe('ProductForm', () => {
  it('validates against the shared schema before calling the API', async () => {
    const calls = vi.fn()
    server.use(
      categoryHandler(),
      http.post('/api/catalog/products', () => {
        calls()
        return HttpResponse.json(ok({}), { status: 201 })
      }),
    )
    renderWithProviders(<ProductForm />)

    submitForm()

    // Required fields are empty, so the API is never reached - the same Zod
    // object the server enforces rejects it first (§18).
    expect(await screen.findByText('Check the highlighted fields')).toBeInTheDocument()
    expect(calls).not.toHaveBeenCalled()
  })

  it('maps a server 422 back onto the field that caused it', async () => {
    server.use(
      categoryHandler(),
      http.patch('/api/catalog/products/p1', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            meta: { requestId: 'req-1' },
            errors: [
              { code: 'VALIDATION_ERROR', field: 'sku', message: 'That SKU is already taken.' },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    renderWithProviders(<ProductForm product={PRODUCT} version={3} />)

    await userEvent.type(screen.getByLabelText(/^Name/), ' Fingers')
    submitForm()

    // The rejection lands on the input that caused it, not in a toast (§18).
    expect(await screen.findByText('That SKU is already taken.')).toBeInTheDocument()
  })

  it('reports a 409 as a toast carrying the request id', async () => {
    server.use(
      categoryHandler(),
      http.patch('/api/catalog/products/p1', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            meta: { requestId: 'req-conflict' },
            errors: [{ code: 'CONFLICT', message: 'A product with that SKU already exists.' }],
          },
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<ProductForm product={PRODUCT} version={3} />)

    await userEvent.type(screen.getByLabelText(/^Name/), ' Fingers')
    submitForm()

    // Errors go to the ASSERTIVE toast region so a screen reader is
    // interrupted; the request id is what a user quotes in a support ticket.
    await waitFor(() => {
      const region = document.querySelector('[aria-live="assertive"]')
      expect(region).toHaveTextContent('Conflict')
      expect(region).toHaveTextContent('req-conflict')
    })
  })

  it('sends If-Match with the loaded version when editing', async () => {
    let ifMatch: string | null = null
    server.use(
      categoryHandler(),
      http.patch('/api/catalog/products/p1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok({ ...PRODUCT, version: 4 }), {
          headers: { ETag: 'W/"v4"' },
        })
      }),
    )

    renderWithProviders(<ProductForm product={PRODUCT} version={3} />)

    await userEvent.type(screen.getByLabelText(/^Name/), ' Fingers')
    submitForm()

    // Optimistic concurrency: the version comes from the record that was
    // loaded, so a concurrent edit is rejected with 412 rather than silently
    // overwritten.
    await waitFor(() => expect(ifMatch).toBe('W/"v3"'))
  })

  it('disables Save until something changes', async () => {
    server.use(categoryHandler())
    renderWithProviders(<ProductForm product={PRODUCT} version={3} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })
})
