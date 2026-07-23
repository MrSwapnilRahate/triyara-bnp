import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  DocumentRepository,
  MutationCtx,
  VerificationHistoryItem,
  VerificationListItem,
  VerificationPatch,
  VerificationRecord,
  VerificationRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  AddVerificationNoteDto,
  ApproveVerificationDto,
  AssignReviewerDto,
  CreateVerificationDto,
  ListVerificationsQuery,
  ReasonDto,
  RequestDocumentsDto,
  ReviewDocumentDto,
  UpdateVerificationDto,
  VerificationStatus,
} from '@triyara/validation'

export type VerificationServiceCtx = AuthContext & { requestId?: string }

// Minimal reviewer lookup (adapted from @triyara/db userRepository in the app).
export interface ReviewerLookup {
  findById(id: string): Promise<{ organizationId: string; roleNames: string[] } | null>
}

export interface VerificationServiceDeps {
  repo: VerificationRepository
  documents: DocumentRepository
  reviewers: ReviewerLookup
  events: EventBus
}

const DEFAULT_REQUIRED = ['GST', 'IEC']

function mctx(ctx: VerificationServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

function assertFrom(
  current: VerificationStatus,
  allowed: VerificationStatus[],
  action: string,
): void {
  if (!allowed.includes(current)) {
    throw new ConflictError(`Cannot ${action} a verification in status ${current}.`)
  }
}

export function createVerificationService({
  repo,
  documents,
  reviewers,
  events,
}: VerificationServiceDeps) {
  async function emit(ctx: VerificationServiceCtx, type: string, v: VerificationRecord) {
    await events.emit(
      makeEvent({
        type,
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        data: { verificationId: v.id, accountId: v.accountId, status: v.status },
      }),
    )
  }

  async function loadOrThrow(ctx: VerificationServiceCtx, id: string): Promise<VerificationRecord> {
    const v = await repo.findById(ctx.organizationId, id)
    if (!v) throw new NotFoundError('Verification not found.')
    return v
  }

  function transition(
    ctx: VerificationServiceCtx,
    v: VerificationRecord,
    expectedVersion: number,
    to: VerificationStatus,
    action: string,
    patch: VerificationPatch,
    reason?: string,
  ): Promise<VerificationRecord> {
    return repo.transition(
      mctx(ctx),
      v.id,
      expectedVersion,
      { ...patch, status: to },
      {
        fromStatus: v.status as VerificationStatus,
        toStatus: to,
        action,
        reason,
      },
    )
  }

  return {
    async create(
      ctx: VerificationServiceCtx,
      dto: CreateVerificationDto,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'create', 'Verification')
      const active = await repo.findActiveForAccount(ctx.organizationId, dto.accountId)
      if (active) throw new ConflictError('An active verification already exists for this account.')
      const v = await repo.create(mctx(ctx), {
        accountId: dto.accountId,
        supplierProfileId: dto.supplierProfileId,
        requiredDocumentTypes: dto.requiredDocumentTypes ?? DEFAULT_REQUIRED,
      })
      await emit(ctx, 'verification.created', v)
      return v
    },

    async get(ctx: VerificationServiceCtx, id: string): Promise<VerificationRecord> {
      assertAbility(ctx, 'read', 'Verification')
      return loadOrThrow(ctx, id)
    },

    async list(
      ctx: VerificationServiceCtx,
      query: ListVerificationsQuery,
    ): Promise<{ items: VerificationListItem[]; nextCursor: string | null; hasMore: boolean }> {
      assertAbility(ctx, 'read', 'Verification')
      return repo.list(ctx.organizationId, {
        limit: query.limit,
        cursor: query.cursor,
        sort: query.sort,
        status: query.status,
        accountId: query.accountId,
        reviewerId: query.reviewerId,
      })
    },

    async history(ctx: VerificationServiceCtx, id: string): Promise<VerificationHistoryItem[]> {
      assertAbility(ctx, 'read', 'Verification')
      await loadOrThrow(ctx, id)
      return repo.history(ctx.organizationId, id)
    },

    async update(
      ctx: VerificationServiceCtx,
      id: string,
      dto: UpdateVerificationDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(
        v.status as VerificationStatus,
        ['DRAFT', 'PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'],
        'edit',
      )
      return transition(ctx, v, version, v.status as VerificationStatus, 'verification.updated', {
        requiredDocumentTypes: dto.requiredDocumentTypes,
      })
    },

    async submit(
      ctx: VerificationServiceCtx,
      id: string,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(v.status as VerificationStatus, ['DRAFT', 'DOCUMENTS_REQUESTED'], 'submit')
      const out = await transition(ctx, v, version, 'PENDING_REVIEW', 'verification.submitted', {
        submittedAt: new Date(),
      })
      await emit(ctx, 'verification.submitted', out)
      return out
    },

    async assign(
      ctx: VerificationServiceCtx,
      id: string,
      dto: AssignReviewerDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      const reviewer = await reviewers.findById(dto.reviewerId)
      if (!reviewer || reviewer.organizationId !== ctx.organizationId) {
        throw new ValidationError('Reviewer not found in your organization.')
      }
      if (!reviewer.roleNames.some((r) => r === 'VERIFIER' || r === 'ADMIN')) {
        throw new ValidationError('Reviewer must be a Verifier or Admin.')
      }
      assertFrom(
        v.status as VerificationStatus,
        ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'],
        'assign',
      )
      const out = await transition(ctx, v, version, 'IN_REVIEW', 'verification.assigned', {
        reviewerId: dto.reviewerId,
      })
      await emit(ctx, 'verification.assigned', out)
      return out
    },

    async requestDocuments(
      ctx: VerificationServiceCtx,
      id: string,
      dto: RequestDocumentsDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(
        v.status as VerificationStatus,
        ['PENDING_REVIEW', 'IN_REVIEW'],
        'request documents for',
      )
      const required = dto.requestedTypes
        ? Array.from(new Set([...v.requiredDocumentTypes, ...dto.requestedTypes]))
        : undefined
      const out = await transition(
        ctx,
        v,
        version,
        'DOCUMENTS_REQUESTED',
        'verification.documents_requested',
        {
          reason: dto.reason,
          ...(required ? { requiredDocumentTypes: required } : {}),
        },
        dto.reason,
      )
      await emit(ctx, 'verification.documents_requested', out)
      return out
    },

    async reviewDocument(
      ctx: VerificationServiceCtx,
      id: string,
      dto: ReviewDocumentDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      const doc = await documents.findById(ctx.organizationId, dto.documentId)
      if (!doc) throw new NotFoundError('Document not found.')
      if (doc.accountId !== v.accountId)
        throw new ForbiddenError('Document does not belong to this account.')
      return repo.reviewDocument(mctx(ctx), id, version, {
        documentId: dto.documentId,
        documentType: doc.type,
        status: dto.status,
        note: dto.note,
      })
    },

    async approve(
      ctx: VerificationServiceCtx,
      id: string,
      dto: ApproveVerificationDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'verify', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(v.status as VerificationStatus, ['IN_REVIEW'], 'approve')

      const accepted = v.reviews.filter((r) => r.status === 'ACCEPTED')
      for (const type of v.requiredDocumentTypes) {
        const item = accepted.find((r) => r.documentType === type)
        if (!item)
          throw new ValidationError(`Missing an accepted document for required type: ${type}.`)
        const doc = await documents.findById(ctx.organizationId, item.documentId)
        if (!doc) throw new ValidationError(`Accepted document for ${type} no longer exists.`)
        if (doc.status === 'EXPIRED' || (doc.expiryDate && new Date(doc.expiryDate) < new Date())) {
          throw new ValidationError(`Document for ${type} is expired.`)
        }
      }

      const expiresAt = new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      const out = await transition(ctx, v, version, 'VERIFIED', 'verification.approved', {
        decision: 'APPROVED',
        decidedAt: new Date(),
        expiresAt,
        reason: null,
      })
      await emit(ctx, 'verification.approved', out)
      return out
    },

    async reject(
      ctx: VerificationServiceCtx,
      id: string,
      dto: ReasonDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'verify', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(
        v.status as VerificationStatus,
        ['PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW'],
        'reject',
      )
      const out = await transition(
        ctx,
        v,
        version,
        'REJECTED',
        'verification.rejected',
        {
          decision: 'REJECTED',
          decidedAt: new Date(),
          reason: dto.reason,
        },
        dto.reason,
      )
      await emit(ctx, 'verification.rejected', out)
      return out
    },

    async suspend(
      ctx: VerificationServiceCtx,
      id: string,
      dto: ReasonDto,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'verify', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(v.status as VerificationStatus, ['VERIFIED'], 'suspend')
      const out = await transition(
        ctx,
        v,
        version,
        'SUSPENDED',
        'verification.suspended',
        { reason: dto.reason },
        dto.reason,
      )
      await emit(ctx, 'verification.suspended', out)
      return out
    },

    async reopen(
      ctx: VerificationServiceCtx,
      id: string,
      version: number,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'update', 'Verification')
      const v = await loadOrThrow(ctx, id)
      assertFrom(v.status as VerificationStatus, ['SUSPENDED', 'REJECTED', 'EXPIRED'], 'reopen')
      const out = await transition(ctx, v, version, 'IN_REVIEW', 'verification.reopened', {
        decision: null,
        decidedAt: null,
        reason: null,
      })
      await emit(ctx, 'verification.reopened', out)
      return out
    },

    async addNote(
      ctx: VerificationServiceCtx,
      id: string,
      dto: AddVerificationNoteDto,
    ): Promise<VerificationRecord> {
      assertAbility(ctx, 'create', 'Note')
      await loadOrThrow(ctx, id)
      return repo.addNote(mctx(ctx), id, dto.body)
    },

    async markExpired(ctx: VerificationServiceCtx): Promise<number> {
      assertAbility(ctx, 'update', 'Verification')
      const ids = await repo.markExpired(ctx.organizationId)
      for (const id of ids) {
        await events.emit(
          makeEvent({
            type: 'verification.expired',
            organizationId: ctx.organizationId,
            actorId: ctx.user.id,
            data: { verificationId: id },
          }),
        )
      }
      return ids.length
    },
  }
}

export type VerificationService = ReturnType<typeof createVerificationService>
