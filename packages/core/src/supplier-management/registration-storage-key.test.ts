import { ValidationError } from '@triyara/lib'
import type { ObjectStat, StorageProvider } from '@triyara/storage'
import { describe, expect, it, vi } from 'vitest'

import { createBuyerRegistrationService } from '../buyer/buyer-registration.service'
import { createSupplierRegistrationService } from './supplier-registration.service'

/**
 * Both public registration endpoints take the storage key back from the
 * browser and previously trusted it, checking only that the object existed.
 * They are unauthenticated, so the key's only provenance was the caller's word.
 */

const ORG = 'org1'
const stat: ObjectStat = { size: 1024, checksum: 'abc' }

/** Records every key `stat` is asked about, so we can prove it is never asked. */
function storageSpy() {
  const statFor = vi.fn(async () => stat)
  const provider: StorageProvider = {
    createUploadUrl: async ({ storageKey }) => ({
      uploadUrl: 'https://storage.example/put',
      method: 'PUT',
      headers: {},
      storageKey,
      expiresAt: 'x',
    }),
    createDownloadUrl: async () => 'https://storage.example/get',
    stat: statFor,
    delete: async () => undefined,
  }
  return { provider, statFor }
}

const organizations = { findBySlug: async () => ({ id: ORG, slug: 'triyara' }) }

function supplierService(storage: StorageProvider) {
  return createSupplierRegistrationService({
    repo: { register: vi.fn(async () => ({ id: 's1', companyName: 'Acme' })) },
    storage,
    events: { emit: vi.fn() },
    organizations,
    intakeOrganizationSlug: 'triyara',
    maxBytes: 20 * 1024 * 1024,
  } as unknown as Parameters<typeof createSupplierRegistrationService>[0])
}

function buyerService(storage: StorageProvider) {
  return createBuyerRegistrationService({
    repo: { register: vi.fn(async () => ({ id: 'b1', legalName: 'Acme' })) },
    storage,
    events: { emit: vi.fn() },
    organizations,
    intakeOrganizationSlug: 'triyara',
    maxBytes: 20 * 1024 * 1024,
  } as unknown as Parameters<typeof createBuyerRegistrationService>[0])
}

const supplierDto = (storageKey: string) =>
  ({
    company: { companyName: 'Acme', country: 'IN' },
    contact: { name: 'A', email: 'a@b.com' },
    business: {},
    products: { productIds: [], proposedProducts: [] },
    certifications: [],
    documents: [{ type: 'OTHER', storageKey, fileName: 'f.pdf', mimeType: 'application/pdf' }],
  }) as unknown as Parameters<ReturnType<typeof supplierService>['submit']>[1]

const buyerDto = (storageKey: string) =>
  ({
    company: { companyName: 'Acme', country: 'IN' },
    contact: { name: 'A', email: 'a@b.com' },
    requirement: { products: [] },
    logistics: {
      destinationCountries: [],
      incoterms: [],
      paymentTerms: [],
      certificationsRequired: [],
      languages: [],
    },
    documents: [{ type: 'OTHER', storageKey, fileName: 'f.pdf', mimeType: 'application/pdf' }],
  }) as unknown as Parameters<ReturnType<typeof buyerService>['submit']>[1]

describe('a public form may only reference what its own presign issued', () => {
  it('refuses a key belonging to an existing account’s documents', async () => {
    // The shape `Document.presign` issues: org/account/uuid/name. An anonymous
    // registrant naming one of those would attach a real supplier's file to
    // their own submission.
    const { provider } = storageSpy()

    await expect(
      supplierService(provider).submit({ requestId: 'r1' }, supplierDto(`${ORG}/acct-9/u/x.pdf`)),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses a buyer enquiry pointing at a supplier registration upload', async () => {
    const { provider } = storageSpy()

    await expect(
      buyerService(provider).submit(
        { requestId: 'r1' },
        buyerDto(`${ORG}/registrations/uuid-1/x.pdf`),
      ),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses another organization’s registration prefix', async () => {
    const { provider } = storageSpy()

    await expect(
      supplierService(provider).submit(
        { requestId: 'r1' },
        supplierDto('other-org/registrations/uuid-1/x.pdf'),
      ),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses a prefix that merely starts with the right characters', async () => {
    // `org1/registrations-evil/...` shares a prefix with `org1/registrations/`
    // only up to the separator. The trailing slash is what makes the check a
    // path-segment test rather than a string test.
    const { provider } = storageSpy()

    await expect(
      supplierService(provider).submit(
        { requestId: 'r1' },
        supplierDto(`${ORG}/registrations-evil/uuid-1/x.pdf`),
      ),
    ).rejects.toThrow(ValidationError)
  })
})

describe('the endpoint is not an existence oracle', () => {
  it('never asks storage about a key it has already rejected', async () => {
    // Order matters. Checking after `stat` would still refuse the submission,
    // but the two failures would be distinguishable and an anonymous caller
    // could use them to probe which keys exist in the bucket.
    const { provider, statFor } = storageSpy()

    await expect(
      supplierService(provider).submit({ requestId: 'r1' }, supplierDto(`${ORG}/acct-9/u/x.pdf`)),
    ).rejects.toThrow(ValidationError)

    expect(statFor).not.toHaveBeenCalled()
  })
})

describe('the legitimate path still works', () => {
  it('accepts a key from the supplier form’s own presign', async () => {
    const { provider } = storageSpy()
    const service = supplierService(provider)

    const presigned = await service.presign({ requestId: 'r1' }, {
      fileName: 'company profile.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    } as never)

    await expect(
      service.submit({ requestId: 'r1' }, supplierDto(presigned.storageKey)),
    ).resolves.toBeDefined()
  })

  it('accepts a key from the buyer form’s own presign', async () => {
    const { provider } = storageSpy()
    const service = buyerService(provider)

    const presigned = await service.presign({ requestId: 'r1' }, {
      fileName: 'requirement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    } as never)

    await expect(
      service.submit({ requestId: 'r1' }, buyerDto(presigned.storageKey)),
    ).resolves.toBeDefined()
  })
})
