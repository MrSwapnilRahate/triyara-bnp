import { randomUUID } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SupplierDocumentData,
  SupplierDocumentRecord,
  SupplierDocumentRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { PresignedUpload, StorageProvider } from '@triyara/storage'
import type {
  PresignSupplierDocumentDto,
  SupplierDocumentDto,
  UpdateSupplierDocumentDto,
} from '@triyara/validation'

/**
 * Supplier documents (TRY-BNP-SUPPLIER-DOC).
 *
 * Upload is the same two-step the Document module already uses: presign, PUT
 * the bytes straight at storage, then record the row. The file never passes
 * through the API process, which is what keeps a 20 MB catalogue from
 * occupying a request handler.
 *
 * Authorization mirrors contacts and certifications, the sibling
 * sub-resources: reading needs `read SupplierProfile`, writing needs `update
 * SupplierProfile`.
 */

export type SupplierDocumentCtx = AuthContext & { requestId?: string }

export interface SupplierDocumentDeps {
  repo: SupplierDocumentRepository
  storage: StorageProvider
  events: EventBus
  /** Matches the platform's document ceiling; injected so it stays one number. */
  maxBytes: number
}

function mutationCtx(ctx: SupplierDocumentCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  return value.trim() === '' ? null : value
}

/** Strips anything that could climb out of the key namespace. */
function sanitize(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

function toData(
  dto: SupplierDocumentDto | UpdateSupplierDocumentDto,
): Partial<SupplierDocumentData> {
  return {
    ...(dto.type !== undefined ? { type: dto.type } : {}),
    ...(dto.title !== undefined ? { title: blankToNull(dto.title) } : {}),
    ...(dto.storageKey !== undefined ? { storageKey: dto.storageKey } : {}),
    ...(dto.mimeType !== undefined ? { mimeType: dto.mimeType } : {}),
    // fileSize and checksum are deliberately absent: both are read from
    // storage in `add`/`update`, never accepted from the client.
    ...(dto.documentNumber !== undefined
      ? { documentNumber: blankToNull(dto.documentNumber) }
      : {}),
    ...(dto.issuedDate !== undefined ? { issuedDate: dto.issuedDate ?? null } : {}),
    ...(dto.expiryDate !== undefined ? { expiryDate: dto.expiryDate ?? null } : {}),
  }
}

/** A certificate cannot expire before it was issued. */
function assertDateOrder(merged: { issuedDate?: Date | null; expiryDate?: Date | null }): void {
  const { issuedDate, expiryDate } = merged
  if (issuedDate && expiryDate && expiryDate.getTime() <= issuedDate.getTime()) {
    throw new ValidationError('The expiry date must fall after the issue date.')
  }
}

export function createSupplierDocumentService({
  repo,
  storage,
  events,
  maxBytes,
}: SupplierDocumentDeps) {
  return {
    async list(ctx: SupplierDocumentCtx, supplierId: string): Promise<SupplierDocumentRecord[]> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.list(ctx.organizationId, supplierId)
    },

    /**
     * Issues a short-lived upload URL. The key is namespaced by organization
     * and supplier, so an object's path alone says who it belongs to - and a
     * uuid segment means two files of the same name never collide.
     */
    async presign(
      ctx: SupplierDocumentCtx,
      supplierId: string,
      dto: PresignSupplierDocumentDto,
    ): Promise<PresignedUpload> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      // Before issuing an upload target: a presigned URL for a supplier the
      // caller cannot see would be a write into someone else's namespace.
      await repo.assertVisible(ctx.organizationId, supplierId)

      const storageKey = `${ctx.organizationId}/suppliers/${supplierId}/${randomUUID()}/${sanitize(dto.fileName)}`
      return storage.createUploadUrl({
        storageKey,
        mimeType: dto.mimeType,
        maxBytes,
      })
    },

    /**
     * Records the row once the bytes are up. Verifies the object actually
     * exists before writing: a row pointing at a key nobody uploaded is worse
     * than no row, because the list would show a file that cannot be opened.
     */
    async add(
      ctx: SupplierDocumentCtx,
      supplierId: string,
      dto: SupplierDocumentDto,
    ): Promise<SupplierDocumentRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      // Visibility first, storage second. Reversing these turns a 404 into a
      // 422 that confirms whether an object exists under someone else's
      // supplier.
      await repo.assertVisible(ctx.organizationId, supplierId)

      const data = toData(dto)
      assertDateOrder(data)

      const stat = await storage.stat(dto.storageKey)
      if (!stat) throw new ValidationError('That upload was not found. Try uploading again.')

      const document = await repo.create(mutationCtx(ctx), supplierId, {
        ...data,
        type: dto.type,
        storageKey: dto.storageKey,
        // Size and checksum come from storage, not from the client: a browser
        // can claim anything, and these two are what a later integrity check
        // would be compared against.
        fileSize: stat.size,
        checksum: stat.checksum,
      })

      await events.emit(
        makeEvent({
          type: 'supplier.document_added',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, documentId: document.id, documentType: document.type },
        }),
      )

      return document
    },

    /**
     * Edits metadata, or replaces the file when a new `storageKey` is given.
     * A replacement keeps the row's identity, which is what someone means by
     * "they sent a newer catalogue".
     */
    async update(
      ctx: SupplierDocumentCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
      dto: UpdateSupplierDocumentDto,
    ): Promise<SupplierDocumentRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const existing = await repo.findById(ctx.organizationId, supplierId, id)
      if (!existing) throw new NotFoundError('Document not found.')

      const patch = toData(dto)
      assertDateOrder({
        issuedDate: patch.issuedDate !== undefined ? patch.issuedDate : existing.issuedDate,
        expiryDate: patch.expiryDate !== undefined ? patch.expiryDate : existing.expiryDate,
      })

      if (dto.storageKey !== undefined) {
        const stat = await storage.stat(dto.storageKey)
        if (!stat) throw new ValidationError('That upload was not found. Try uploading again.')
        patch.fileSize = stat.size
        patch.checksum = stat.checksum
      }

      const document = await repo.update(mutationCtx(ctx), supplierId, id, expectedVersion, patch)

      await events.emit(
        makeEvent({
          type:
            dto.storageKey !== undefined
              ? 'supplier.document_replaced'
              : 'supplier.document_updated',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, documentId: id },
        }),
      )

      return document
    },

    /** A short-lived signed URL for the stored object. */
    async fileUrl(
      ctx: SupplierDocumentCtx,
      supplierId: string,
      id: string,
      disposition: 'inline' | 'attachment' = 'attachment',
    ): Promise<string> {
      assertAbility(ctx, 'read', 'SupplierProfile')

      const document = await repo.findById(ctx.organizationId, supplierId, id)
      if (!document) throw new NotFoundError('Document not found.')
      if (!document.storageKey) throw new NotFoundError('This document has no stored file.')

      return storage.createDownloadUrl({
        storageKey: document.storageKey,
        ...(document.title ? { downloadName: document.title } : {}),
        ...(document.mimeType ? { contentType: document.mimeType } : {}),
        disposition,
      })
    },

    async remove(
      ctx: SupplierDocumentCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
    ): Promise<SupplierDocumentRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const document = await repo.remove(mutationCtx(ctx), supplierId, id, expectedVersion)

      await events.emit(
        makeEvent({
          type: 'supplier.document_removed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, documentId: id },
        }),
      )

      return document
    },
  }
}

export type SupplierDocumentService = ReturnType<typeof createSupplierDocumentService>
