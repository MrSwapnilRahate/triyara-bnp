import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { BuyerReviewPanel, type BuyerReviewSubject } from '../components/buyer-review-panel'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const account = (over: Partial<BuyerReviewSubject> = {}): BuyerReviewSubject => ({
  id: 'acc1',
  registrationStatus: 'PENDING_REVIEW',
  isSelfRegistered: true,
  version: 2,
  ...over,
})

describe('BuyerReviewPanel', () => {
  it('offers a decision on an account awaiting review', async () => {
    renderWithProviders(<BuyerReviewPanel account={account()} />)

    expect(await screen.findByText('Awaiting review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('warns that a self-registered account has not been checked', async () => {
    renderWithProviders(<BuyerReviewPanel account={account()} />)
    expect(await screen.findByText('Self-registered')).toBeInTheDocument()
    expect(screen.getByText(/nothing here has been checked by us/i)).toBeInTheDocument()
  })

  it('shows nothing once a decision has been taken', () => {
    renderWithProviders(<BuyerReviewPanel account={account({ registrationStatus: 'APPROVED' })} />)
    // The state machine refuses a decision from APPROVED, so offering the
    // buttons would present an action the API is right to reject.
    expect(screen.queryByText('Awaiting review')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('sends the decision with the version as If-Match', async () => {
    const seen = vi.fn()
    server.use(
      http.post('/api/v1/accounts/:id/approval', async ({ request }) => {
        seen({ ifMatch: request.headers.get('If-Match'), body: await request.json() })
        return HttpResponse.json(ok({ id: 'acc1', registrationStatus: 'APPROVED' }))
      }),
    )
    renderWithProviders(<BuyerReviewPanel account={account()} />)

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
      http.post('/api/v1/accounts/:id/approval', async ({ request }) => {
        seen(await request.json())
        return HttpResponse.json(ok({ id: 'acc1', registrationStatus: 'REJECTED' }))
      }),
    )
    renderWithProviders(<BuyerReviewPanel account={account()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => expect(seen).toHaveBeenCalled())
    expect(seen.mock.calls[0]![0]).not.toHaveProperty('comments')
  })

  it('surfaces a second reviewer getting there first', async () => {
    server.use(
      http.post('/api/v1/accounts/:id/approval', () =>
        HttpResponse.json(
          fail([
            { code: 'PRECONDITION_FAILED', message: 'This account changed since you opened it.' },
          ]),
          { status: 412 },
        ),
      ),
    )
    renderWithProviders(<BuyerReviewPanel account={account({ version: 1 })} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /approve/i }))
    expect(await screen.findByText(/changed since you opened it/i)).toBeInTheDocument()
  })

  it('hides the controls from anyone who cannot manage accounts', () => {
    // EXPORT_MANAGER may edit an account but not decide whether it is real.
    renderWithProviders(<BuyerReviewPanel account={account()} />, { roles: ['EXPORT_MANAGER'] })
    expect(screen.queryByText('Awaiting review')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<BuyerReviewPanel account={account()} />)
    await screen.findByText('Awaiting review')
    await expectNoAxeViolations(container)
  })
})
