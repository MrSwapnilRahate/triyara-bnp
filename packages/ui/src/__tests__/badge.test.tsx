import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge, humaniseStatus, STATUS_TONE, StatusBadge } from '../components/badge'
import { expectNoAxeViolations } from './axe'

describe('StatusBadge', () => {
  it('humanises SCREAMING_SNAKE into a readable label', () => {
    expect(humaniseStatus('PENDING_APPROVAL')).toBe('Pending approval')
    expect(humaniseStatus('SENT')).toBe('Sent')
  })

  it('renders the humanised status as text, so colour is never the only signal', () => {
    render(<StatusBadge status="UNDER_NEGOTIATION" />)
    expect(screen.getByText('Under negotiation')).toBeDefined()
  })

  it('maps every workflow status used across the four modules to a tone', () => {
    const statuses = [
      // RFQ
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ISSUED',
      'IN_PROGRESS',
      'EVALUATING',
      'AWARDED',
      'CLOSED',
      'CANCELLED',
      'EXPIRED',
      // Quotation
      'SENT',
      'UNDER_NEGOTIATION',
      'ACCEPTED',
      'REJECTED',
      'WITHDRAWN',
      'SUPERSEDED',
      // Supplier
      'PENDING_REVIEW',
      'BLOCKED',
      'INACTIVE',
      // Participation
      'INVITED',
      'VIEWED',
      'DECLINED',
      'SUBMITTED',
      'NO_RESPONSE',
    ]
    const unmapped = statuses.filter((s) => !STATUS_TONE[s])
    expect(unmapped).toEqual([])
  })

  it('falls back to neutral for an unknown status rather than throwing', () => {
    render(<StatusBadge status="SOME_FUTURE_STATE" />)
    expect(screen.getByText('Some future state')).toBeDefined()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <Badge tone="success">Active</Badge>
        <StatusBadge status="SENT" />
        <StatusBadge status="REJECTED" />
      </div>,
    )
    await expectNoAxeViolations(container)
  })
})
