import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Input, SearchInput, Textarea } from '../components/input'
import { Label } from '../components/label'
import { expectNoAxeViolations } from './axe'

describe('Input', () => {
  it('accepts typed text', async () => {
    render(
      <>
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" />
      </>,
    )
    await userEvent.type(screen.getByLabelText('SKU'), 'TRY-TUR-001')
    expect(screen.getByLabelText('SKU')).toHaveValue('TRY-TUR-001')
  })

  it('exposes an invalid state to assistive technology', () => {
    render(
      <>
        <Label htmlFor="gst">GST</Label>
        <Input id="gst" invalid />
      </>,
    )
    expect(screen.getByLabelText('GST')).toHaveAttribute('aria-invalid', 'true')
  })

  it('marks a required field without relying on the asterisk alone', () => {
    render(
      <>
        <Label htmlFor="name" required>
          Company name
        </Label>
        <Input id="name" required />
      </>,
    )
    expect(screen.getByLabelText(/company name/i)).toBeRequired()
  })

  it('has no axe violations when labelled', async () => {
    const { container } = render(
      <>
        <Label htmlFor="a">Field</Label>
        <Input id="a" />
        <Label htmlFor="b">Notes</Label>
        <Textarea id="b" />
      </>,
    )
    await expectNoAxeViolations(container)
  })
})

describe('SearchInput', () => {
  it('shows a clear control only when there is something to clear', async () => {
    const onClear = vi.fn()
    const { rerender } = render(
      <SearchInput aria-label="Search suppliers" value="" readOnly onClear={onClear} />,
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()

    rerender(<SearchInput aria-label="Search suppliers" value="acme" readOnly onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('announces a result summary in a live region', () => {
    render(
      <SearchInput aria-label="Search" value="acme" readOnly resultSummary="3 suppliers found" />,
    )
    expect(screen.getByText('3 suppliers found')).toBeDefined()
  })

  it('has no axe violations', async () => {
    const { container } = render(<SearchInput aria-label="Search suppliers" value="" readOnly />)
    await expectNoAxeViolations(container)
  })
})
