import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ToastProvider, useToast } from '../components/toast'
import { expectNoAxeViolations } from './axe'

function Harness() {
  const { success, error, push } = useToast()
  return (
    <div>
      <button type="button" onClick={() => success('Supplier saved')}>
        succeed
      </button>
      <button type="button" onClick={() => error('Could not save', { requestId: 'req-abc123' })}>
        fail
      </button>
      <button type="button" onClick={() => push({ tone: 'info', title: 'Heads up', duration: 50 })}>
        transient
      </button>
    </div>
  )
}

describe('Toast', () => {
  it('shows a success message in the polite region', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'succeed' }))
    const polite = screen.getByRole('status')
    expect(polite).toHaveTextContent('Supplier saved')
  })

  it('shows an error in the assertive region with its request id', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'fail' }))
    const assertive = screen.getByRole('alert')
    expect(assertive).toHaveTextContent('Could not save')
    expect(assertive).toHaveTextContent('req-abc123')
  })

  it('keeps errors until dismissed - a failure must not vanish unread', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'fail' }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('auto-dismisses a transient toast', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'transient' }))
    expect(screen.getByRole('status')).toHaveTextContent('Heads up')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })
    expect(screen.getByRole('status')).not.toHaveTextContent('Heads up')
  })

  it('can be dismissed by keyboard', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'fail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.getByRole('alert')).not.toHaveTextContent('Could not save')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'fail' }))
    await expectNoAxeViolations(container)
  })
})
