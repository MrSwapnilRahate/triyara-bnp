import { randomUUID } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  CreateDocumentInput,
  DocumentListItem,
  DocumentRecord,
  DocumentRepository,
  ListDocumentsParams,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ForbiddenError, NotFoundError } from '@triyara/lib'
import type { PresignedUpload, StorageProvider } from '@triyara/storage'
import {
  type CreateDocumentDto,
  type CreateDocumentVersionDto,
  type ListDocumentsQuery,
  MAX_FILE_SIZE,
  type PresignDocumentDto,
  type UpdateDocumentDto,
} from '@triyara/validation'

export type DocumentServiceCtx = AuthContext & { requestId?: string }

export interface DocumentServiceDeps {
  repo: DocumentRepository
  storage: StorageProvider
  events: EventBus
}

function mutationCtx(ctx: DocumentServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

function sanitize(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  return cleaned.length ? cleaned : 'file'
}

export function createDocumentService({ repo, storage, events }: DocumentServiceDeps) {
  async function emit(ctx: DocumentServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  function assertOrgKey(ctx: DocumentServiceCtx, storageKey: string): void {
    if (!storageKey.startsWith(`${ctx.organizationId}/`)) {
      throw new ForbiddenError('Storage key is outside your organization.')
    }
  }

  async function statOrThrow(storageKey: string) {
    const stat = await storage.stat(storageKey)
    if (!stat) throw new NotFoundError('Uploaded file not found. Upload before confirming.')
    return stat
  }

  return {
    async presign(ctx: DocumentServiceCtx, dto: PresignDocumentDto): Promise<PresignedUpload> {
      assertAbility(ctx, 'create', 'Document')
      const storageKey = `${ctx.organizationId}/${dto.accountId}/${randomUUID()}/${sanitize(dto.fileName)}`
      return storage.createUploadUrl({
        storageKey,
        mimeType: dto.mimeType,
        maxBytes: MAX_FILE_SIZE,
      })
    },

    async create(ctx: DocumentServiceCtx, dto: CreateDocumentDto): Promise<DocumentRecord> {
      assertAbility(ctx, 'create', 'Document')
      assertOrgKey(ctx, dto.storageKey)
      const stat = await statOrThrow(dto.storageKey)
      const input: CreateDocumentInput = {
        accountId: dto.accountId,
        supplierProfileId: dto.supplierProfileId,
        type: dto.type,
        title: dto.title,
        mimeType: dto.mimeType,
        originalFilename: dto.originalFilename,
        storageKey: dto.storageKey,
        fileSize: stat.size,
        checksum: stat.checksum,
        issuedDate: dto.issuedDate,
        expiryDate: dto.expiryDate,
      }
      const doc = await repo.create(mutationCtx(ctx), input)
      await emit(ctx, 'document.uploaded', {
        documentId: doc.id,
        accountId: doc.accountId,
        type: doc.type,
      })
      return doc
    },

    async get(
      ctx: DocumentServiceCtx,
      id: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<DocumentRecord> {
      assertAbility(ctx, 'read', 'Document')
      const doc = await repo.findById(ctx.organizationId, id, opts)
      if (!doc) throw new NotFoundError('Document not found.')
      return doc
    },

    async list(
      ctx: DocumentServiceCtx,
      query: ListDocumentsQuery,
    ): Promise<{ items: DocumentListItem[]; nextCursor: string | null; hasMore: boolean }> {
      assertAbility(ctx, 'read', 'Document')
      const params: ListDocumentsParams = {
        limit: query.limit,
        cursor: query.cursor,
        sort: query.sort,
        q: query.q,
        accountId: query.accountId,
        type: query.type,
        status: query.status,
        expiringBefore: query.expiringBefore,
        includeDeleted: query.includeDeleted,
      }
      return repo.list(ctx.organizationId, params)
    },

    async update(
      ctx: DocumentServiceCtx,
      id: string,
      dto: UpdateDocumentDto,
      expectedVersion: number,
    ): Promise<DocumentRecord> {
      assertAbility(ctx, 'update', 'Document')
      const doc = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto, 'document.updated')
      await emit(ctx, 'document.updated', { documentId: id })
      return doc
    },

    async remove(
      ctx: DocumentServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<DocumentRecord> {
      assertAbility(ctx, 'delete', 'Document')
      const doc = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'document.deleted', { documentId: id })
      return doc
    },

    async restore(
      ctx: DocumentServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<DocumentRecord> {
      assertAbility(ctx, 'update', 'Document')
      const doc = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'document.restored', { documentId: id })
      return doc
    },

    async addVersion(
      ctx: DocumentServiceCtx,
      id: string,
      dto: CreateDocumentVersionDto,
      expectedVersion: number,
    ): Promise<DocumentRecord> {
      assertAbility(ctx, 'update', 'Document')
      assertOrgKey(ctx, dto.storageKey)
      const stat = await statOrThrow(dto.storageKey)
      const doc = await repo.addVersion(mutationCtx(ctx), id, expectedVersion, {
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        originalFilename: dto.originalFilename,
        fileSize: stat.size,
        checksum: stat.checksum,
      })
      await emit(ctx, 'document.version_created', {
        documentId: id,
        version: doc.currentFileVersion,
      })
      return doc
    },

    async fileUrl(
      ctx: DocumentServiceCtx,
      id: string,
      disposition: 'inline' | 'attachment' = 'attachment',
    ): Promise<string> {
      assertAbility(ctx, 'read', 'Document')
      const doc = await repo.findById(ctx.organizationId, id)
      if (!doc) throw new NotFoundError('Document not found.')
      return storage.createDownloadUrl({
        storageKey: doc.currentStorageKey,
        downloadName: doc.currentOriginalFilename,
        contentType: doc.currentMimeType,
        disposition,
      })
    },

    async markExpired(ctx: DocumentServiceCtx): Promise<number> {
      assertAbility(ctx, 'update', 'Document')
      const ids = await repo.markExpired(ctx.organizationId)
      for (const id of ids) await emit(ctx, 'document.expired', { documentId: id })
      return ids.length
    },
  }
}

export type DocumentService = ReturnType<typeof createDocumentService>
