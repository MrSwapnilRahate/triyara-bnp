import { buildAbilityFor, type Role } from '@triyara/auth'
import type { SupplierRecord, SupplierRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { createSupplierMasterService, type SupplierMasterCtx } from './supplier.service'

function ctxFor(roles: Role[]): SupplierMasterCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeSupplier(over: Partial<SupplierRecord> = {}): SupplierRecord {
  return {
    id: 's1',
    organizationId: 'org1',
    supplierCode: 'SUP-000001',
    companyName: 'Nizam Spice',
    legalName: 'Nizam Spice Pvt Ltd',
    businessType: 'MANUFACTURER_EXPORTER',
    email: null,
    phone: null,
    website: null,
    gstNumber: null,
    iecNumber: null,
    panNumber: null,
    country: 'IN',
    state: null,
    city: null,
    status: 'DRAFT',
    isVerified: false,
    verifiedAt: null,
    accountId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    contacts: [],
    addresses: [],
    bankAccounts: [],
    certifications: [],
    tags: [],
    ...over,
  } as SupplierRecord
}

function fakeEvents(sink: DomainEvent[] = []): EventBus {
  return {
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
    subscribe: () => undefined,
  } as unknown as EventBus
}

function fakeRepo(over: Partial<SupplierRepository> = {}): SupplierRepository {
  return {
    create: async () => makeSupplier(),
    findById: async () => makeSupplier(),
    findByCode: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
    mutate: async () => makeSupplier({ version: 2 }),
    transition: async () => makeSupplier({ status: 'PENDING_REVIEW', version: 2 }),
    approvalHistory: async () => [],
    softDelete: async () => makeSupplier({ deletedAt: new Date(), status: 'INACTIVE' }),
    restore: async () => makeSupplier({ version: 3 }),
    replaceContacts: async () => undefined,
    expiringCertifications: async () => [],
    ...over,
  } as SupplierRepository
}

describe('supplier master service', () => {
  it('lets an EXPORT_MANAGER onboard a supplier', async () => {
    const sink: DomainEvent[] = []
    const svc = createSupplierMasterService({ repo: fakeRepo(), events: fakeEvents(sink) })
    const s = await svc.create(ctxFor(['EXPORT_MANAGER']), {
      supplierCode: 'SUP-000001',
      companyName: 'X',
      legalName: 'X Ltd',
      businessType: 'TRADER',
    })
    expect(s.supplierCode).toBe('SUP-000001')
    expect(sink.map((e) => e.type)).toContain('supplier.created')
  })

  it('refuses onboarding from a READ_ONLY user', async () => {
    const svc = createSupplierMasterService({ repo: fakeRepo(), events: fakeEvents() })
    await expect(
      svc.create(ctxFor(['READ_ONLY']), {
        supplierCode: 'X',
        companyName: 'X',
        legalName: 'X',
        businessType: 'TRADER',
      }),
    ).rejects.toThrow(/not permitted/i)
  })

  it('separates onboarding from approval: EXPORT_MANAGER may create but not approve', async () => {
    const svc = createSupplierMasterService({
      repo: fakeRepo({ findById: async () => makeSupplier({ status: 'PENDING_REVIEW' }) }),
      events: fakeEvents(),
    })
    await expect(
      svc.decide(ctxFor(['EXPORT_MANAGER']), 's1', 1, { decision: 'APPROVED' }),
    ).rejects.toThrow(/not permitted/i)
  })

  it('lets an ADMIN approve a supplier awaiting review', async () => {
    const sink: DomainEvent[] = []
    const svc = createSupplierMasterService({
      repo: fakeRepo({
        findById: async () => makeSupplier({ status: 'PENDING_REVIEW' }),
        transition: async () => makeSupplier({ status: 'APPROVED', isVerified: true, version: 2 }),
      }),
      events: fakeEvents(sink),
    })
    const s = await svc.decide(ctxFor(['ADMIN']), 's1', 1, { decision: 'APPROVED' })
    expect(s.status).toBe('APPROVED')
    expect(sink.map((e) => e.type)).toContain('supplier.approved')
  })

  it('rejects an illegal workflow transition', async () => {
    const svc = createSupplierMasterService({
      repo: fakeRepo({ findById: async () => makeSupplier({ status: 'DRAFT' }) }),
      events: fakeEvents(),
    })
    // DRAFT -> APPROVED skips review and is not a legal transition.
    await expect(svc.decide(ctxFor(['ADMIN']), 's1', 1, { decision: 'APPROVED' })).rejects.toThrow(
      /cannot move a DRAFT supplier to APPROVED/i,
    )
  })

  it('points at restore when the code belongs to a deleted supplier', async () => {
    const svc = createSupplierMasterService({
      repo: fakeRepo({ findByCode: async () => makeSupplier({ deletedAt: new Date() }) }),
      events: fakeEvents(),
    })
    await expect(
      svc.create(ctxFor(['ADMIN']), {
        supplierCode: 'SUP-000001',
        companyName: 'X',
        legalName: 'X',
        businessType: 'TRADER',
      }),
    ).rejects.toThrow(/restore it instead/i)
  })

  it('allows every role to read the supplier list', async () => {
    const svc = createSupplierMasterService({ repo: fakeRepo(), events: fakeEvents() })
    await expect(svc.list(ctxFor(['READ_ONLY']), { limit: 25 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })
})
