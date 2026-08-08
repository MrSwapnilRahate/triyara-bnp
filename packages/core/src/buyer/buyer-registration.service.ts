import { randomUUID } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  BuyerApprovalRecord,
  BuyerRegistrationData,
  BuyerRegistrationRepository,
  BuyerRegistrationResult,
  BuyerUpload,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { PresignedUpload, StorageProvider } from '@triyara/storage'
import type {
  BuyerApprovalDto,
  BuyerRegistrationDto,
  PresignRegistrationUploadDto,
} from '@triyara/validation'

import { resolveTransition } from '../onboarding/review-workflow'

// Public buyer registration (TRY-BNP-BUYER-REG).
//
// Two surfaces in one service, with deliberately different trust models:
//
//   - `presign` and `submit` are PUBLIC. No AuthContext, because the caller has
//     no account. Tenancy comes from configuration, never the request; the
//     audit actor is the reserved system identity; abuse is held off at the
//     route by IP rate limiting. Identical to the supplier registration
//     service, for the same reasons.
//   - `decide` is INTERNAL and takes an AuthContext, gated on `manage Account`.
//     It shares the transition guard with the supplier workflow rather than
//     restating it, so the two cannot drift.

/** Reserved audit identity for work nobody signed in to do. */
export const BUYER_SYSTEM_ACTOR_ID = 'system:public-registration'

export interface BuyerRegistrationCtx {
  requestId?: string
}

export type BuyerReviewCtx = AuthContext & { requestId?: string }

export interface OrganizationLookup {
  findBySlug(slug: string): Promise<{ id: string } | null>
}

export interface BuyerRegistrationDeps {
  repo: BuyerRegistrationRepository
  storage: StorageProvider
  events: EventBus
  organizations: OrganizationLookup
  intakeOrganizationSlug: string
  maxBytes: number
  maxUploads?: number
}

/** Keeps a caller-supplied name from shaping the storage path. */
function sanitize(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

/**
 * The prefix every key this endpoint may reference has to sit under.
 *
 * `presign` issues keys here and nowhere else, but `submit` receives the key
 * back from the browser, and until this existed it accepted any key at all -
 * checking only that the object exists. This endpoint is unauthenticated, so
 * "the caller told us" is the weakest possible provenance for a path.
 *
 * Separate from the supplier form's prefix on purpose: a buyer enquiry has no
 * business referencing a supplier registration's upload either.
 */
function assertBuyerRegistrationKey(organizationId: string, storageKey: string): void {
  if (!storageKey.startsWith(`${organizationId}/buyer-registrations/`)) {
    throw new ValidationError('That upload does not belong to this enquiry.')
  }
}

export function createBuyerRegistrationService({
  repo,
  storage,
  events,
  organizations,
  intakeOrganizationSlug,
  maxBytes,
  maxUploads = 30,
}: BuyerRegistrationDeps) {
  /**
   * The tenant public submissions belong to. Resolved per call rather than
   * cached at construction: the service is built at module load, when the
   * database may not be reachable, and a misconfigured slug should surface as a
   * clear message on the first enquiry rather than crash the app's boot.
   */
  async function intakeOrganizationId(): Promise<string> {
    const org = await organizations.findBySlug(intakeOrganizationSlug)
    if (!org) {
      throw new NotFoundError(
        'Registration is not available at the moment. Please contact us directly.',
      )
    }
    return org.id
  }

  return {
    /**
     * Issues an upload target for a buyer with no account.
     *
     * Namespaced under `buyer-registrations/` with a fresh uuid, so an
     * anonymous uploader can neither guess nor overwrite another submission's
     * file, nor anything belonging to an existing account.
     */
    async presign(
      _ctx: BuyerRegistrationCtx,
      dto: PresignRegistrationUploadDto,
    ): Promise<PresignedUpload> {
      const organizationId = await intakeOrganizationId()
      const storageKey = `${organizationId}/buyer-registrations/${randomUUID()}/${sanitize(dto.fileName)}`
      return storage.createUploadUrl({ storageKey, mimeType: dto.mimeType, maxBytes })
    },

    /**
     * Records a submitted enquiry.
     *
     * Every referenced upload is confirmed present in storage and its real size
     * read from there. A browser can claim any key and any size; a row pointing
     * at bytes nobody uploaded would show the review team a document that
     * cannot be opened.
     */
    async submit(
      ctx: BuyerRegistrationCtx,
      dto: BuyerRegistrationDto,
    ): Promise<BuyerRegistrationResult> {
      const organizationId = await intakeOrganizationId()

      if (dto.documents.length > maxUploads) {
        throw new ValidationError(`An enquiry may carry at most ${maxUploads} files.`)
      }

      const documents: BuyerUpload[] = []
      for (const doc of dto.documents) {
        // Before `stat`, not after: otherwise this endpoint answers whether an
        // arbitrary key exists in the bucket, which is a question an anonymous
        // caller has no business asking.
        assertBuyerRegistrationKey(organizationId, doc.storageKey)
        const stat = await storage.stat(doc.storageKey)
        if (!stat) {
          throw new ValidationError(
            `The upload for ${doc.fileName ?? doc.type} was not found. Please attach it again.`,
          )
        }
        documents.push({
          type: doc.type,
          storageKey: doc.storageKey,
          ...(doc.fileName ? { title: doc.fileName } : {}),
          ...(doc.mimeType ? { mimeType: doc.mimeType } : {}),
          fileSize: stat.size,
          checksum: stat.checksum,
        })
      }

      const data: BuyerRegistrationData = {
        company: dto.company,
        contact: dto.contact,
        logistics: dto.logistics,
        products: dto.requirement.products,
        documents,
        ...(dto.requirement.annualRequirement
          ? { annualRequirement: dto.requirement.annualRequirement }
          : {}),
        ...(dto.requirement.packaging ? { packaging: dto.requirement.packaging } : {}),
        ...(dto.notes ? { notes: dto.notes } : {}),
      }

      const account = await repo.register(
        { actorId: BUYER_SYSTEM_ACTOR_ID, organizationId, requestId: ctx.requestId },
        data,
      )

      await events.emit(
        makeEvent({
          type: 'buyer.self_registered',
          organizationId,
          actorId: BUYER_SYSTEM_ACTOR_ID,
          data: {
            accountId: account.id,
            companyName: dto.company.companyName,
            country: dto.company.country,
          },
        }),
      )

      return account
    },

    /**
     * Records a review decision. INTERNAL — this one has a signed-in reviewer.
     *
     * `manage Account` rather than `update`: deciding whether a company is real
     * is not the same authority as correcting its address, and the supplier
     * workflow draws the line in the same place.
     */
    async decide(
      ctx: BuyerReviewCtx,
      id: string,
      expectedVersion: number,
      dto: BuyerApprovalDto,
    ): Promise<BuyerApprovalRecord> {
      assertAbility(ctx, 'manage', 'Account')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Account not found.')

      const target = resolveTransition(current.registrationStatus, dto.decision, 'buyer')

      const account = await repo.transition(
        { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId },
        id,
        expectedVersion,
        target,
        dto.decision,
        dto.comments,
      )

      await events.emit(
        makeEvent({
          type: `buyer.${dto.decision.toLowerCase()}`,
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            accountId: account.id,
            fromStatus: current.registrationStatus,
            toStatus: account.registrationStatus,
          },
        }),
      )
      return account
    },

    async approvalHistory(ctx: BuyerReviewCtx, id: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.approvalHistory(ctx.organizationId, id)
    },
  }
}

export type BuyerRegistrationService = ReturnType<typeof createBuyerRegistrationService>
