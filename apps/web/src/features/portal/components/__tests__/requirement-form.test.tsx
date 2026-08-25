import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

/**
 * The form a buyer types a requirement into.
 *
 * The interesting assertions are about what is NOT on it. Every identity and
 * ownership value the row needs is derived on the server, so a field for any of
 * them would be both redundant and an invitation: a company-name box is a box a
 * buyer can put another company's name in.
 */

const submitRequirementAction = vi.fn(async () => ({}))
vi.mock('@/app/(portal)/portal/requirements/actions', () => ({
  submitRequirementAction: (...a: unknown[]) => submitRequirementAction(...(a as [])),
}))

const { RequirementForm } = await import('@/features/portal/components/requirement-form')

function renderForm() {
  return renderWithProviders(<RequirementForm />, { roles: ['EXTERNAL_PARTY'] })
}

describe('the form asks about the goods and nothing else', () => {
  it('asks for the product and the quantity', () => {
    renderForm()
    expect(screen.getByLabelText(/product/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument()
  })

  it('marks the two required fields as required', () => {
    renderForm()
    expect(screen.getByLabelText(/product/i)).toBeRequired()
    expect(screen.getByLabelText(/quantity/i)).toBeRequired()
  })

  it('offers the optional commercial fields', () => {
    renderForm()
    for (const label of [/monthly volume/i, /packaging/i, /target price/i, /destination port/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it.each([
    ['account', /account/i],
    ['organization', /organisation|organization/i],
    ['company', /company/i],
    ['contact name', /contact name/i],
    ['email', /email/i],
    ['status', /status/i],
    ['reference', /reference/i],
    ['priority', /priority|lead score/i],
  ])('has no %s field', (_label, pattern) => {
    renderForm()
    expect(screen.queryByLabelText(pattern)).not.toBeInTheDocument()
  })

  it('renders no input the server does not read', () => {
    const { container } = renderForm()
    const names = [...container.querySelectorAll('input, textarea, select')]
      .map((el) => el.getAttribute('name'))
      .filter(Boolean)
      .sort()

    expect(names).toEqual([
      'destinationPort',
      'monthlyVolume',
      'packaging',
      'product',
      'quantity',
      'requirements',
      'targetPrice',
      'timeline',
    ])
  })

  it('carries no hidden field at all', () => {
    // The obvious place an account id would be smuggled back in.
    const { container } = renderForm()
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })
})

describe('accessibility', () => {
  it('has no violations', async () => {
    const { container } = renderForm()
    await expectNoAxeViolations(container)
  })

  it('gives every field a label', () => {
    const { container } = renderForm()
    for (const el of container.querySelectorAll('input, textarea')) {
      const id = el.getAttribute('id')
      expect(id, 'every field needs an id to be labelled by').toBeTruthy()
      expect(container.querySelector(`label[for="${id}"]`)).toBeTruthy()
    }
  })
})

/**
 * The source of the form, for the parts rendering cannot show.
 *
 * Whether the submit button disables itself while a submission is in flight is
 * behaviour under a pending state that the DOM does not expose at rest.
 */
describe('repeat submission is discouraged in the browser and prevented on the server', () => {
  const source = readFileSync(join(__dirname, '../requirement-form.tsx'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('disables the submit control while the action is running', () => {
    expect(code).toContain('disabled={pending}')
  })

  it('does not treat that as the guarantee', () => {
    // The server-side window is what actually stops a second row; the disabled
    // button only stops the most common way of asking for one.
    expect(source).toMatch(/server holds a[\s\S]{0,80}window/i)
  })
})
