import type { DomainEvent } from '@triyara/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supplierContacts = vi.fn()
const supplierFindById = vi.fn()
const supplierHistory = vi.fn()
const buyerContacts = vi.fn()
const buyerFindById = vi.fn()
const buyerHistory = vi.fn()

vi.mock('@triyara/db', () => ({
  supplierContactRepository: { list: (...a: unknown[]) => supplierContacts(...a) },
  supplierRepository: {
    findById: (...a: unknown[]) => supplierFindById(...a),
    approvalHistory: (...a: unknown[]) => supplierHistory(...a),
  },
  buyerRegistrationRepository: {
    contacts: (...a: unknown[]) => buyerContacts(...a),
    findById: (...a: unknown[]) => buyerFindById(...a),
    approvalHistory: (...a: unknown[]) => buyerHistory(...a),
  },
}))

const { createEmailSubscriber } = await import('./email-subscriber')

function emailSpy() {
  return {
    supplierRegistered: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    buyerRegistered: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    staffNewRegistration: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    registrationDecided: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    passwordReset: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    staffInvite: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    adminAccessRequested: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    adminAccessApproved: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    adminAccessRejected: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
    adminAccessRevoked: vi.fn(async () => ({ status: 'sent' as const, id: 'x', attempts: 1 })),
  }
}

function event(type: string, data: Record<string, unknown>): DomainEvent {
  return {
    id: 'evt_1',
    type,
    occurredAt: new Date().toISOString(),
    organizationId: 'org_1',
    actor: { type: 'system', id: null },
    data,
  }
}

describe('email subscriber', () => {
  let email: ReturnType<typeof emailSpy>

  beforeEach(() => {
    vi.clearAllMocks()
    email = emailSpy()
  })

  it('confirms a supplier registration and alerts staff', async () => {
    supplierContacts.mockResolvedValue([
      { name: 'Second', email: 'second@x.example', isPrimary: false },
      { name: 'Anita Rao', email: 'anita@x.example', isPrimary: true },
    ])
    const onEvent = createEmailSubscriber(email)

    await onEvent(
      event('supplier.self_registered', {
        supplierId: 'sup_1',
        supplierCode: 'SUP-0042',
        companyName: 'Sunrise Foods',
        country: 'India',
      }),
    )

    // Primary contact wins even when listed second.
    expect(email.supplierRegistered).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: { name: 'Anita Rao', email: 'anita@x.example' },
        companyName: 'Sunrise Foods',
        supplierCode: 'SUP-0042',
      }),
    )
    expect(email.staffNewRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'supplier', reference: 'SUP-0042', country: 'India' }),
    )
  })

  it('still alerts staff when the supplier has no email at all', async () => {
    // A WhatsApp-only supplier must not vanish from the review queue just
    // because we cannot write to them.
    supplierContacts.mockResolvedValue([{ name: 'Phone Only', email: null, isPrimary: true }])
    const onEvent = createEmailSubscriber(email)

    await onEvent(
      event('supplier.self_registered', { supplierId: 'sup_1', companyName: 'Sunrise Foods' }),
    )

    expect(email.supplierRegistered).not.toHaveBeenCalled()
    expect(email.staffNewRegistration).toHaveBeenCalledTimes(1)
  })

  it('confirms a buyer registration and alerts staff', async () => {
    buyerContacts.mockResolvedValue([{ name: 'Jan', email: 'jan@nw.example', isPrimary: true }])
    const onEvent = createEmailSubscriber(email)

    await onEvent(
      event('buyer.self_registered', {
        accountId: 'acc_1',
        companyName: 'Northwind Trading',
        country: 'Netherlands',
      }),
    )

    expect(email.buyerRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Northwind Trading' }),
    )
    expect(email.staffNewRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'buyer', country: 'Netherlands' }),
    )
  })

  it('sends a supplier rejection carrying the reviewer comment', async () => {
    supplierFindById.mockResolvedValue({ id: 'sup_1', companyName: 'Sunrise Foods' })
    supplierContacts.mockResolvedValue([{ name: 'Anita', email: 'anita@x.example' }])
    supplierHistory.mockResolvedValue([
      { comments: 'older note', reviewedAt: new Date('2026-01-01') },
      { comments: 'FSSAI certificate had expired.', reviewedAt: new Date('2026-06-01') },
    ])
    const onEvent = createEmailSubscriber(email)

    await onEvent(event('supplier.rejected', { supplierId: 'sup_1' }))

    expect(email.registrationDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'supplier',
        decision: 'rejected',
        companyName: 'Sunrise Foods',
        comments: 'FSSAI certificate had expired.', // the latest, not the first
      }),
    )
  })

  it('sends a buyer approval', async () => {
    buyerFindById.mockResolvedValue({ id: 'acc_1', legalName: 'Northwind Trading' })
    buyerContacts.mockResolvedValue([{ name: 'Jan', email: 'jan@nw.example' }])
    buyerHistory.mockResolvedValue([])
    const onEvent = createEmailSubscriber(email)

    await onEvent(event('buyer.approved', { accountId: 'acc_1' }))

    expect(email.registrationDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'buyer',
        decision: 'approved',
        companyName: 'Northwind Trading',
      }),
    )
  })

  it('ignores events that are not an email moment', async () => {
    const onEvent = createEmailSubscriber(email)

    await onEvent(event('supplier.note_added', { supplierId: 'sup_1' }))
    await onEvent(event('role.granted', { userId: 'u_1' }))

    expect(email.supplierRegistered).not.toHaveBeenCalled()
    expect(email.registrationDecided).not.toHaveBeenCalled()
    expect(email.staffNewRegistration).not.toHaveBeenCalled()
    // No repository work either - unrelated events must stay cheap.
    expect(supplierContacts).not.toHaveBeenCalled()
    expect(supplierFindById).not.toHaveBeenCalled()
  })

  it('does nothing when the decided record has since disappeared', async () => {
    supplierFindById.mockResolvedValue(null)
    const onEvent = createEmailSubscriber(email)

    await onEvent(event('supplier.approved', { supplierId: 'gone' }))

    expect(email.registrationDecided).not.toHaveBeenCalled()
  })

  it('tolerates an event whose payload is missing the ids', async () => {
    const onEvent = createEmailSubscriber(email)

    await onEvent(event('supplier.self_registered', {}))
    await onEvent(event('buyer.approved', {}))

    expect(email.supplierRegistered).not.toHaveBeenCalled()
    expect(email.staffNewRegistration).not.toHaveBeenCalled()
    expect(email.registrationDecided).not.toHaveBeenCalled()
  })
})
