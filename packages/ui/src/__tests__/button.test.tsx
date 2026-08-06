import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button, IconButton } from '../components/button'
import { expectNoAxeViolations } from './axe'

describe('Button', () => {
  it('renders its label and responds to a click', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is reachable and activatable by keyboard alone', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Approve</Button>)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('blocks interaction while loading and marks itself busy', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Submitting
      </Button>,
    )
    const button = screen.getByRole('button', { name: /submitting/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps its label visible while loading, so width does not jump', () => {
    render(<Button loading>Send quotation</Button>)
    expect(screen.getByText('Send quotation')).toBeDefined()
  })

  it('lets a caller className override a variant default', () => {
    render(<Button className="px-8">Wide</Button>)
    // twMerge must drop the variant's px-3 rather than emitting both.
    const cls = screen.getByRole('button').className
    expect(cls).toContain('px-8')
    expect(cls).not.toContain('px-3')
  })

  it('renders as its child when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/rfqs">Go to RFQs</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Go to RFQs' })).toHaveAttribute('href', '/rfqs')
  })

  it('has no axe violations across every variant', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </div>,
    )
    await expectNoAxeViolations(container)
  })
})

describe('IconButton', () => {
  it('exposes an accessible name even though it shows only an icon', () => {
    render(
      <IconButton label="Delete supplier">
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Delete supplier' })).toBeDefined()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <IconButton label="Close panel">
        <svg />
      </IconButton>,
    )
    await expectNoAxeViolations(container)
  })
})
