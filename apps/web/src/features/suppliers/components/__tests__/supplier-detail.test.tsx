import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierDetail } from '../supplier-detail'

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString()
const past = new Date(Date.now() - 10 * 86_400_000).toISOString()

const SUPPLIER = {
  id: 's1',
  supplierCode: 'SUP-000001',
  companyName: 'Acme Spices',
  legalName: 'Acme Spices Pvt Ltd',
  businessType: 'MANUFACTURER',
  email: 'trade@acme.test',
  phone: '+91 484 000 0000',
  country: 'IN',
  state: 'Kerala',
  city: 'Kochi',
  status: 'APPROVED' as const,
  isVerified: true,
  verifiedAt: null,
  accountId: null,
  version: 2,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  website: 'https://acme.test',
  gstNumber: '32AAAAA0000A1Z5',
  iecNumber: 'IEC123',
  panNumber: 'AAAAA0000A',
  contacts: [
    {
      id: 'c1',
      name: 'Priya Raman',
      role: 'SALES',
      designation: 'Head of Exports',
      email: 'p@acme.test',
      phone: null,
      isPrimary: true,
    },
  ],
  addresses: [
    {
      id: 'a1',
      type: 'FACTORY',
      line1: '12 Spice Road',
      city: 'Kochi',
      state: 'Kerala',
      postalCode: '682001',
      country: 'IN',
      isPrimary: true,
    },
  ],
  bankAccounts: [
    {
      id: 'b1',
      bankName: 'State Bank',
      branchName: 'Kochi',
      accountHolderName: 'Acme Spices Pvt Ltd',
      ifscCode: 'SBIN0000001',
      swiftCode: null,
      currency: 'INR',
      isPrimary: true,
      isVerified: true,
    },
  ],
  certifications: [
    {
      id: 'x1',
      type: 'FSSAI',
      certificateNumber: 'F-1',
      issuedBy: 'FSSAI',
      issuedDate: null,
      expiryDate: soon,
      status: 'ACTIVE',
      scope: null,
    },
    {
      id: 'x2',
      type: 'HACCP',
      certificateNumber: 'H-1',
      issuedBy: null,
      issuedDate: null,
      expiryDate: past,
      status: 'ACTIVE',
      scope: null,
    },
  ],
  tags: [],
}

function handlers() {
  return [
    http.get('/api/suppliers/s1', () =>
      HttpResponse.json(ok(SUPPLIER), { headers: { ETag: 'W/"v2"' } }),
    ),
    http.get('/api/suppliers/s1/products', () => HttpResponse.json(ok([], { nextCursor: null }))),
  ]
}

describe('SupplierDetail', () => {
  it('renders the identity and status', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDetail id="s1" />)

    expect(await screen.findByRole('heading', { name: 'Acme Spices' })).toBeInTheDocument()
    expect(screen.getByText('SUP-000001')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('warns about certifications lapsing within 30 days', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDetail id="s1" />)
    await screen.findByRole('heading', { name: 'Acme Spices' })
    expect(screen.getByText(/certification.* expire within 30 days/i)).toBeInTheDocument()
  })

  it('distinguishes an expired certification from a lapsing one', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDetail id="s1" />)
    await screen.findByRole('heading', { name: 'Acme Spices' })

    await userEvent.click(screen.getByRole('tab', { name: /Certifications/ }))
    expect(await screen.findByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('Lapsing soon')).toBeInTheDocument()
  })

  it('never renders a bank account number, and says so', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<SupplierDetail id="s1" />)
    await screen.findByRole('heading', { name: 'Acme Spices' })

    await userEvent.click(screen.getByRole('tab', { name: /Banking/ }))
    expect(await screen.findByText('State Bank')).toBeInTheDocument()
    // The API's projection omits accountNumber entirely; the UI states the
    // absence so it reads as a control, not as missing data.
    expect(screen.getByText(/Account numbers are not retrievable/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/accountNumber/)
  })

  it('shows Edit to an EXPORT_MANAGER and hides it from READ_ONLY', async () => {
    server.use(...handlers())
    const { unmount } = renderWithProviders(<SupplierDetail id="s1" />, {
      roles: ['EXPORT_MANAGER'],
    })
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument()
    unmount()

    server.use(...handlers())
    renderWithProviders(<SupplierDetail id="s1" />, { roles: ['READ_ONLY'] })
    await screen.findByRole('heading', { name: 'Acme Spices' })
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('surfaces a load failure inline rather than blanking the screen', async () => {
    server.use(
      http.get('/api/suppliers/s1', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            meta: { requestId: 'r' },
            errors: [{ code: 'NOT_FOUND', message: 'gone' }],
          },
          { status: 404 },
        ),
      ),
    )
    renderWithProviders(<SupplierDetail id="s1" />)
    // Not findByRole('alert'): the toast live region is always present and
    // empty, so that would match it and assert nothing.
    expect(await screen.findByText('Not found')).toBeInTheDocument()
    expect(screen.getByText('This record no longer exists.')).toBeInTheDocument()
  })
})
