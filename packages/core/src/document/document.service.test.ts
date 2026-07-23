import { buildAbilityFor, type Role } from '@triyara/auth'
import type { DocumentRecord, DocumentRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import type { ObjectStat, StorageProvider } from '@triyara/storage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDocumentService, type DocumentServiceCtx } from './document.service'

function ctxFor(roles: Role[]): DocumentServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeDoc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'd1',
    organizationId: 'org1',
    accountId: 'acc1',
    supplierProfileId: null,
    type: 'GST',
    status: 'RECEIVED',
    title: 'GST',
    issuedDate: null,
    expiryDate: null,
    currentFileVersion: 1,
    currentStorageKey: 'org1/acc1/x/f.pdf',
    currentMimeType: 'application/pdf',
    currentOriginalFilename: 'f.pdf',
    currentFileSize: 5,
    currentChecksum: 'abc',
    version: 1,
    createdById: 'u1',
    updatedById: 'u1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [],
    ...over,
  }
}

function fakeRepo(over: Partial<DocumentRepository> = {}): DocumentRepository {
  return {
    create: async () => makeDoc(),
    findById: async () => makeDoc(),
    list: async () => ({ items: [], nextCursor: null, hasMore: false }),
    mutate: async () => makeDoc({ version: 2 }),
    softDelete: async () => makeDoc({ deletedAt: new Date() }),
    restore: async () => makeDoc(),
    addVersion: async () => makeDoc({ currentFileVersion: 2 }),
    markExpired: async () => [],
    ...over,
  }
}

function fakeStorage(stat: ObjectStat | null = { size: 5, checksum: 'abc' }): StorageProvider {
  return {
    createUploadUrl: async ({ storageKey }) => ({
      uploadUrl: '/up',
      method: 'PUT',
      headers: {},
      storageKey,
      expiresAt: 'x',
    }),
    createDownloadUrl: async () => '/dl',
    stat: async () => stat,
    delete: async () => undefined,
  }
}

function spyBus() {
  const emitted: DomainEvent[] = []
  const bus: EventBus = { emit: async (e) => void emitted.push(e as DomainEvent) }
  return { bus, emitted }
}

describe('document service', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })

  it('READ_ONLY cannot presign', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(),
      events: events.bus,
    })
    await expect(
      svc.presign(ctxFor(['READ_ONLY']), {
        fileName: 'f.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 5,
        accountId: 'acc1',
        type: 'GST',
      }),
    ).rejects.toThrow()
  })

  it('create rejects a storage key from another org', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(),
      events: events.bus,
    })
    await expect(
      svc.create(ctxFor(['ADMIN']), {
        storageKey: 'other-org/x/f.pdf',
        accountId: 'acc1',
        type: 'GST',
        title: 'GST',
        mimeType: 'application/pdf',
        originalFilename: 'f.pdf',
      }),
    ).rejects.toThrow(/organization/i)
  })

  it('create fails when the uploaded file is missing', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(null),
      events: events.bus,
    })
    await expect(
      svc.create(ctxFor(['ADMIN']), {
        storageKey: 'org1/acc1/x/f.pdf',
        accountId: 'acc1',
        type: 'GST',
        title: 'GST',
        mimeType: 'application/pdf',
        originalFilename: 'f.pdf',
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('create success emits document.uploaded', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(),
      events: events.bus,
    })
    await svc.create(ctxFor(['EXPORT_MANAGER']), {
      storageKey: 'org1/acc1/x/f.pdf',
      accountId: 'acc1',
      type: 'GST',
      title: 'GST',
      mimeType: 'application/pdf',
      originalFilename: 'f.pdf',
    })
    expect(events.emitted.map((e) => e.type)).toEqual(['document.uploaded'])
  })

  it('addVersion emits document.version_created', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(),
      events: events.bus,
    })
    await svc.addVersion(
      ctxFor(['EXPORT_MANAGER']),
      'd1',
      { storageKey: 'org1/acc1/y/f2.pdf', mimeType: 'application/pdf', originalFilename: 'f2.pdf' },
      1,
    )
    expect(events.emitted.map((e) => e.type)).toEqual(['document.version_created'])
  })

  it('remove requires delete ability (manager denied, admin allowed)', async () => {
    const svc = createDocumentService({
      repo: fakeRepo(),
      storage: fakeStorage(),
      events: events.bus,
    })
    await expect(svc.remove(ctxFor(['EXPORT_MANAGER']), 'd1', 1)).rejects.toThrow()
    await expect(svc.remove(ctxFor(['ADMIN']), 'd1', 1)).resolves.toBeTruthy()
  })
})
