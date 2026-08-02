import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import type { Supplier } from '../../types'
import { SupplierReviewPanel } from '../supplier-review-panel'

const supplier = (over: Partial<Supplier> = {}) =>
  ({
    id: 's1',
    supplierCode: 'REG-ABCDEF0123',
    companyName: 'Kerala Spice Exports',
    legalName: 'Kerala Spice Exports Pvt Ltd',
    businessType: 'MANUFACTURER_EXPORTER',
    email: null,
    phone: null,
    country: 'IN',
    state: null,
    city: 'Kochi',
    status: 'PENDING_REVIEW',
    isVerified: false,
    verifiedAt: null,
    accountId: null,
    version: 2,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    website: null,
    gstNumber: null,
    iecNumber: null,
    panNumber: null,
    isSelfRegistered: true,
    contacts: [],
    addresses: [],
    bankAccounts: [],
    certifications: [],
    tags: [],
    ...over,
  }) as Supplier

describe('SupplierReviewPanel', () => {
  it('offers a decision on a supplier awaiting review', async () => {
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={2} />)

    expect(await screen.findByText('Awaiting review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('warns that a self-registered record has not been checked', async () => {
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={2} />)
    expect(await screen.findByText('Self-registered')).toBeInTheDocument()
    expect(screen.getByText(/nothing here has been checked by us/i)).toBeInTheDocument()
  })

  it('shows nothing once a decision has been taken', () => {
    renderWithProviders(
      <SupplierReviewPanel supplier={supplier({ status: 'APPROVED' })} version={2} />,
    )
    // The state machine refuses a decision from APPROVED, so offering the
    // buttons would present an action the API is right to reject.
    expect(screen.queryByText('Awaiting review')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
  })

  it('sends the decision with the version as If-Match', async () => {
    const seen = vi.fn()
    server.use(
      http.post('/api/suppliers/:id/approval', async ({ request }) => {
        seen({ ifMatch: request.headers.get('If-Match'), body: await request.json() })
        return HttpResponse.json(ok({ ...supplier(), status: 'APPROVED', version: 3 }))
      }),
    )
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={2} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/comments/i), 'Documents check out.')
    await user.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(seen).toHaveBeenCalled())
    expect(seen.mock.calls[0]![0]).toMatchObject({
      ifMatch: 'W/"v2"',
      body: { decision: 'APPROVED', comments: 'Documents check out.' },
    })
  })

  it('omits empty comments rather than sending a blank string', async () => {
    const seen = vi.fn()
    server.use(
      http.post('/api/suppliers/:id/approval', async ({ request }) => {
        seen(await request.json())
        return HttpResponse.json(ok({ ...supplier(), status: 'REJECTED', version: 3 }))
      }),
    )
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={2} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => expect(seen).toHaveBeenCalled())
    expect(seen.mock.calls[0]![0]).not.toHaveProperty('comments')
  })

  it('surfaces a second reviewer getting there first', async () => {
    server.use(
      http.post('/api/suppliers/:id/approval', () =>
        HttpResponse.json(
          fail([
            { code: 'PRECONDITION_FAILED', message: 'This supplier changed since you opened it.' },
          ]),
          { status: 412 },
        ),
      ),
    )
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={1} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /approve/i }))
    expect(await screen.findByText(/changed since you opened it/i)).toBeInTheDocument()
  })

  it('hides the controls from anyone who cannot manage suppliers', () => {
    // EXPORT_MANAGER may edit a supplier but not decide its fate.
    renderWithProviders(<SupplierReviewPanel supplier={supplier()} version={2} />, {
      roles: ['EXPORT_MANAGER'],
    })
    expect(screen.queryByText('Awaiting review')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <SupplierReviewPanel supplier={supplier()} version={2} />,
    )
    await screen.findByText('Awaiting review')
    await expectNoAxeViolations(container)
  })
})
