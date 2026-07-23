import { buildAbilityFor, type Role } from '@triyara/auth'
import type {
  DocumentRecord,
  DocumentRepository,
  VerificationRecord,
  VerificationRepository,
} from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createVerificationService,
  type ReviewerLookup,
  type VerificationServiceCtx,
} from './verification.service'

function ctxFor(roles: Role[]): VerificationServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function vrec(over: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    id: 'v1',
    organizationId: 'org1',
    accountId: 'acc1',
    supplierProfileId: null,
    status: 'DRAFT',
    decision: null,
    reason: null,
    reviewerId: null,
    requiredDocumentTypes: ['GST'],
    submittedAt: null,
    decidedAt: null,
    expiresAt: null,
    version: 1,
    createdById: 'u1',
    updatedById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    reviews: [],
    notes: [],
    ...over,
  }
}

function fakeRepo(initial: VerificationRecord, active: boolean): VerificationRepository {
  let cur = initial
  return {
    create: async () => cur,
    findById: async () => cur,
    findActiveForAccount: async () => (active ? { ...cur } : null),
    list: async () => ({ items: [], nextCursor: null, hasMore: false }),
    transition: async (_c, _id, _v, patch, hist) => {
      cur = { ...cur, ...patch, status: patch.status ?? cur.status, version: cur.version + 1 }
      void hist
      return cur
    },
    addNote: async () => cur,
    reviewDocument: async () => cur,
    history: async () => [],
    markExpired: async () => [],
  }
}

function fakeDocs(doc: DocumentRecord | null): DocumentRepository {
  return {
    create: async () => doc!,
    findById: async () => doc,
    list: async () => ({ items: [], nextCursor: null, hasMore: false }),
    mutate: async () => doc!,
    softDelete: async () => doc!,
    restore: async () => doc!,
    addVersion: async () => doc!,
    markExpired: async () => [],
  }
}

function doc(over: Partial<DocumentRecord> = {}): DocumentRecord {
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
    currentStorageKey: 'k',
    currentMimeType: 'application/pdf',
    currentOriginalFilename: 'f.pdf',
    currentFileSize: 1,
    currentChecksum: 'c',
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

const reviewers = (roleNames: string[]): ReviewerLookup => ({
  findById: async () => ({ organizationId: 'org1', roleNames }),
})

function spyBus() {
  const emitted: DomainEvent[] = []
  const bus: EventBus = { emit: async (e) => void emitted.push(e as DomainEvent) }
  return { bus, emitted }
}

describe('verification service (state machine)', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })

  function svc(
    rec: VerificationRecord,
    active = false,
    d: DocumentRecord | null = doc(),
    rv = reviewers(['VERIFIER']),
  ) {
    return createVerificationService({
      repo: fakeRepo(rec, active),
      documents: fakeDocs(d),
      reviewers: rv,
      events: events.bus,
    })
  }

  it('READ_ONLY cannot create', async () => {
    await expect(svc(vrec()).create(ctxFor(['READ_ONLY']), { accountId: 'acc1' })).rejects.toThrow()
  })

  it('blocks a second active verification', async () => {
    await expect(
      svc(vrec(), true).create(ctxFor(['ADMIN']), { accountId: 'acc1' }),
    ).rejects.toThrow(/active verification/i)
  })

  it('submit only from DRAFT/DOCUMENTS_REQUESTED', async () => {
    await expect(
      svc(vrec({ status: 'VERIFIED' })).submit(ctxFor(['ADMIN']), 'v1', 1),
    ).rejects.toThrow(/Cannot submit/i)
    const out = await svc(vrec({ status: 'DRAFT' })).submit(ctxFor(['ADMIN']), 'v1', 1)
    expect(out.status).toBe('PENDING_REVIEW')
    expect(events.emitted.map((e) => e.type)).toContain('verification.submitted')
  })

  it('assign rejects a non-verifier reviewer', async () => {
    const s = svc(vrec({ status: 'PENDING_REVIEW' }), false, doc(), reviewers(['EXPORT_MANAGER']))
    await expect(s.assign(ctxFor(['ADMIN']), 'v1', { reviewerId: 'r1' }, 1)).rejects.toThrow(
      /Verifier or Admin/i,
    )
  })

  it('approve requires all required docs accepted (and only verifier/admin)', async () => {
    // manager lacks verify ability
    await expect(
      svc(vrec({ status: 'IN_REVIEW' })).approve(
        ctxFor(['EXPORT_MANAGER']),
        'v1',
        { expiresInDays: 365 },
        1,
      ),
    ).rejects.toThrow()
    // admin but no accepted GST doc
    await expect(
      svc(vrec({ status: 'IN_REVIEW', requiredDocumentTypes: ['GST'], reviews: [] })).approve(
        ctxFor(['ADMIN']),
        'v1',
        { expiresInDays: 365 },
        1,
      ),
    ).rejects.toThrow(/Missing an accepted document/i)
    // admin with accepted GST -> VERIFIED
    const rec = vrec({
      status: 'IN_REVIEW',
      requiredDocumentTypes: ['GST'],
      reviews: [
        {
          id: 'rv',
          documentId: 'd1',
          documentType: 'GST',
          status: 'ACCEPTED',
          note: null,
          reviewedById: 'u1',
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    })
    const out = await svc(rec).approve(ctxFor(['ADMIN']), 'v1', { expiresInDays: 365 }, 1)
    expect(out.status).toBe('VERIFIED')
    expect(out.decision).toBe('APPROVED')
    expect(events.emitted.map((e) => e.type)).toContain('verification.approved')
  })

  it('approve rejects when the accepted document is expired', async () => {
    const rec = vrec({
      status: 'IN_REVIEW',
      requiredDocumentTypes: ['GST'],
      reviews: [
        {
          id: 'rv',
          documentId: 'd1',
          documentType: 'GST',
          status: 'ACCEPTED',
          note: null,
          reviewedById: 'u1',
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    })
    const s = svc(rec, false, doc({ status: 'EXPIRED' }))
    await expect(s.approve(ctxFor(['ADMIN']), 'v1', { expiresInDays: 365 }, 1)).rejects.toThrow(
      /expired/i,
    )
  })

  it('suspend only from VERIFIED; reopen from REJECTED', async () => {
    await expect(
      svc(vrec({ status: 'DRAFT' })).suspend(ctxFor(['ADMIN']), 'v1', { reason: 'x' }, 1),
    ).rejects.toThrow(/Cannot suspend/i)
    const out = await svc(vrec({ status: 'REJECTED' })).reopen(ctxFor(['ADMIN']), 'v1', 1)
    expect(out.status).toBe('IN_REVIEW')
    expect(events.emitted.map((e) => e.type)).toContain('verification.reopened')
  })
})
