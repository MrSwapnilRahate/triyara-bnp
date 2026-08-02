import { randomUUID } from 'node:crypto'

import { NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { supplierNoteRepository } from './supplier-note.repository'

// Supplier notes / CRM timeline (TRY-BNP-SUPPLIER-02) against a real database.
//
// Fixtures are namespaced to this file. Vitest runs files in parallel and
// `upsert` is select-then-insert, so sharing an organization slug or user email
// with another suite races on a cold database.
describe.skipIf(!process.env.DATABASE_URL)('supplier notes (integration)', () => {
  let organizationId = ''
  let otherOrgId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'note-it' }
  let otherCtx = { actorId: '', organizationId: '', requestId: 'note-it' }
  let supplierId = ''
  let otherSupplierId = ''

  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)

  async function makeSupplier(orgId: string) {
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: orgId,
        supplierCode: `NOTE-${uniq().toUpperCase()}`,
        companyName: 'Note Co',
        legalName: 'Note Co Pvt Ltd',
        businessType: 'MANUFACTURER',
      },
    })
    return supplier.id
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'note-itest' },
      update: {},
      create: { name: 'Note IT', slug: 'note-itest' },
    })
    organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'note-it@triyara.test' },
      update: {},
      create: { organizationId, email: 'note-it@triyara.test', name: 'Priya', passwordHash: 'x' },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'note-it' }

    const other = await prisma.organization.upsert({
      where: { slug: 'note-itest-other' },
      update: {},
      create: { name: 'Note IT Other', slug: 'note-itest-other' },
    })
    otherOrgId = other.id
    const otherUser = await prisma.user.upsert({
      where: { email: 'note-it-other@triyara.test' },
      update: {},
      create: {
        organizationId: otherOrgId,
        email: 'note-it-other@triyara.test',
        name: 'Outsider',
        passwordHash: 'x',
      },
    })
    otherCtx = { actorId: otherUser.id, organizationId: otherOrgId, requestId: 'note-it' }

    supplierId = await makeSupplier(organizationId)
    otherSupplierId = await makeSupplier(otherOrgId)
  })

  it('records a note against a supplier with its author and channel', async () => {
    const note = await supplierNoteRepository.create(ctx, supplierId, {
      body: 'Quoted 20MT turmeric at $1800 CIF Jebel Ali. Wants 30% advance.',
      source: 'WHATSAPP',
    })

    expect(note.body).toContain('$1800 CIF Jebel Ali')
    expect(note.source).toBe('WHATSAPP')
    expect(note.authorId).toBe(ctx.actorId)
    expect(note.author?.name).toBe('Priya')
    expect(note.version).toBe(1)
    expect(note.editedAt).toBeNull()
  })

  it('accepts a note with no channel recorded', async () => {
    const note = await supplierNoteRepository.create(ctx, supplierId, { body: 'Walk-in enquiry.' })
    expect(note.source).toBeNull()
  })

  it('orders the timeline newest first', async () => {
    const supplier = await makeSupplier(organizationId)
    const first = await supplierNoteRepository.create(ctx, supplier, { body: 'First contact' })
    const second = await supplierNoteRepository.create(ctx, supplier, { body: 'Second contact' })
    const third = await supplierNoteRepository.create(ctx, supplier, { body: 'Third contact' })

    const page = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      limit: 25,
    })
    expect(page.items.map((n) => n.id)).toEqual([third.id, second.id, first.id])
  })

  it('pages the timeline without repeating or dropping a note', async () => {
    const supplier = await makeSupplier(organizationId)
    for (let i = 0; i < 5; i++) {
      await supplierNoteRepository.create(ctx, supplier, { body: `Note ${i}` })
    }

    const first = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      limit: 2,
    })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const second = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      limit: 2,
      cursor: first.nextCursor!,
    })
    const seen = [...first.items, ...second.items].map((n) => n.id)
    expect(new Set(seen).size).toBe(4)
  })

  it('filters the timeline by channel', async () => {
    const supplier = await makeSupplier(organizationId)
    await supplierNoteRepository.create(ctx, supplier, { body: 'On WA', source: 'WHATSAPP' })
    await supplierNoteRepository.create(ctx, supplier, { body: 'On IM', source: 'INDIAMART' })

    const page = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      source: 'INDIAMART',
      limit: 25,
    })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.body).toBe('On IM')
  })

  it('marks a revised body as edited, but not a re-tagged channel', async () => {
    const note = await supplierNoteRepository.create(ctx, supplierId, {
      body: 'Target price $1750',
      source: 'PHONE',
    })

    // The editor submits body AND source on every save, so re-tagging the
    // channel resends the unchanged body. That must not read as a revision.
    const retagged = await supplierNoteRepository.mutate(ctx, note.id, note.version, {
      body: 'Target price $1750',
      source: 'WHATSAPP',
    })
    expect(retagged.source).toBe('WHATSAPP')
    expect(retagged.editedAt).toBeNull()

    const revised = await supplierNoteRepository.mutate(ctx, note.id, retagged.version, {
      body: 'Target price $1700 after negotiation',
    })
    expect(revised.body).toContain('$1700')
    expect(revised.editedAt).not.toBeNull()
  })

  it('rejects a stale version with a precondition failure', async () => {
    const note = await supplierNoteRepository.create(ctx, supplierId, { body: 'Agreed 60 days' })
    await supplierNoteRepository.mutate(ctx, note.id, note.version, { body: 'Agreed 45 days' })

    // The first writer's version is now behind; their edit must not land.
    await expect(
      supplierNoteRepository.mutate(ctx, note.id, note.version, { body: 'Agreed 90 days' }),
    ).rejects.toBeInstanceOf(PreconditionFailedError)

    const current = await supplierNoteRepository.findById(organizationId, note.id)
    expect(current!.body).toBe('Agreed 45 days')
  })

  it('soft deletes a note and drops it from the timeline', async () => {
    const supplier = await makeSupplier(organizationId)
    const note = await supplierNoteRepository.create(ctx, supplier, { body: 'Wrong supplier' })

    const removed = await supplierNoteRepository.softDelete(ctx, note.id, note.version)
    expect(removed.deletedAt).not.toBeNull()

    const page = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      limit: 25,
    })
    expect(page.items).toHaveLength(0)
    expect(await supplierNoteRepository.findById(organizationId, note.id)).toBeNull()
  })

  it('reports a missing note as not found rather than as an edit conflict', async () => {
    // Distinct failures: a note that never existed is not the same event as two
    // people editing the same note, and the caller acts differently on each.
    await expect(
      supplierNoteRepository.softDelete(ctx, 'note-that-does-not-exist', 1),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      supplierNoteRepository.mutate(ctx, 'note-that-does-not-exist', 1, { body: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses to attach a note to a supplier in another organization', async () => {
    await expect(
      supplierNoteRepository.create(ctx, otherSupplierId, { body: 'Cross-tenant write' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('hides another organization notes from read, edit and delete', async () => {
    const theirs = await supplierNoteRepository.create(otherCtx, otherSupplierId, {
      body: 'Their commercial terms',
    })

    expect(await supplierNoteRepository.findById(organizationId, theirs.id)).toBeNull()
    const page = await supplierNoteRepository.list({
      organizationId,
      supplierId: otherSupplierId,
      limit: 25,
    })
    expect(page.items).toHaveLength(0)

    await expect(
      supplierNoteRepository.mutate(ctx, theirs.id, theirs.version, { body: 'tampered' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      supplierNoteRepository.softDelete(ctx, theirs.id, theirs.version),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('treats an invisible supplier as absent rather than empty', async () => {
    await expect(
      supplierNoteRepository.assertVisible(organizationId, otherSupplierId),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      supplierNoteRepository.assertVisible(organizationId, 'no-such-supplier'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('keeps a note readable after its author is gone', async () => {
    const supplier = await makeSupplier(organizationId)
    const leaver = await prisma.user.create({
      data: {
        organizationId,
        email: `leaver-${uniq()}@triyara.test`,
        name: 'Leaver',
        passwordHash: 'x',
      },
    })
    const note = await supplierNoteRepository.create(
      { actorId: leaver.id, organizationId, requestId: 'note-it' },
      supplier,
      { body: 'Agreed packaging: 25kg PP bags' },
    )
    expect(note.author?.name).toBe('Leaver')

    // No FK ties the note to the user, so the record outlives the account.
    await prisma.user.delete({ where: { id: leaver.id } })

    const page = await supplierNoteRepository.list({
      organizationId,
      supplierId: supplier,
      limit: 25,
    })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.body).toContain('25kg PP bags')
    expect(page.items[0]!.author).toBeNull()
  })

  it('writes an audit entry against the supplier for every note mutation', async () => {
    const supplier = await makeSupplier(organizationId)
    const note = await supplierNoteRepository.create(ctx, supplier, { body: 'Sample dispatched' })
    await supplierNoteRepository.mutate(ctx, note.id, note.version, { body: 'Sample received' })
    await supplierNoteRepository.softDelete(ctx, note.id, note.version + 1)

    const entries = await prisma.auditLog.findMany({
      where: { organizationId, entityType: 'Supplier', entityId: supplier },
      select: { action: true },
    })
    // Audited against the supplier, so one query answers "what happened to
    // this supplier" without first knowing any note ids.
    expect(entries.map((e) => e.action).sort()).toEqual([
      'supplier.note_added',
      'supplier.note_removed',
      'supplier.note_updated',
    ])
  })
})
