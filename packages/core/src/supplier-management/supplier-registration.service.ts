import { randomUUID } from 'node:crypto'

import type {
  RegistrationData,
  RegistrationResult,
  SupplierRegistrationRepository,
  VerifiedUpload,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { PresignedUpload, StorageProvider } from '@triyara/storage'
import type { PresignRegistrationUploadDto, SupplierRegistrationDto } from '@triyara/validation'

// Public supplier registration (TRY-BNP-SUPPLIER-REG).
//
// The one service in the codebase with no AuthContext, because its caller has
// no account. That absence is deliberate and bounded:
//
//   - There is no `assertAbility`. There is no principal to check. Abuse is
//     held off at the route by IP rate limiting, not by a permission that
//     nobody holds.
//   - Tenancy cannot come from a session, so it is resolved here, once, from
//     configuration. It is never taken from the request: a body-supplied
//     organizationId would let the internet write into any tenant.
//   - The audit actor is a reserved system identity. `AuditLog.actorId` carries
//     no foreign key (it is a historical record, like VerificationNote and
//     Activity), so a sentinel is representable without inventing a user row.

/** Reserved audit identity for work nobody signed in to do. */
export const SYSTEM_ACTOR_ID = 'system:public-registration'

export interface RegistrationServiceCtx {
  requestId?: string
}

export interface OrganizationLookup {
  /** Resolves the tenant that public registrations belong to. */
  findBySlug(slug: string): Promise<{ id: string } | null>
}

export interface RegistrationServiceDeps {
  repo: SupplierRegistrationRepository
  storage: StorageProvider
  events: EventBus
  organizations: OrganizationLookup
  /** Slug of the organization public registrations land in. */
  intakeOrganizationSlug: string
  maxBytes: number
  /** Ceiling on files per submission, independent of the schema's own caps. */
  maxUploads?: number
}

/** Keeps a caller-supplied name from shaping the storage path. */
function sanitize(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

export function createSupplierRegistrationService({
  repo,
  storage,
  events,
  organizations,
  intakeOrganizationSlug,
  maxBytes,
  maxUploads = 40,
}: RegistrationServiceDeps) {
  /**
   * The tenant public submissions belong to.
   *
   * Resolved per call rather than cached at construction: the service is
   * created at module load, when the database may not be reachable yet, and a
   * misconfigured slug should surface as a clear error on the first
   * registration rather than crash the app's boot.
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
     * Issues an upload target before the form is submitted.
     *
     * The key is namespaced under `registrations/` with a fresh uuid, so an
     * anonymous uploader can neither guess nor overwrite anything: not another
     * registrant's file, and nothing under an existing supplier.
     */
    async presign(
      _ctx: RegistrationServiceCtx,
      dto: PresignRegistrationUploadDto,
    ): Promise<PresignedUpload> {
      const organizationId = await intakeOrganizationId()
      const storageKey = `${organizationId}/registrations/${randomUUID()}/${sanitize(dto.fileName)}`
      return storage.createUploadUrl({
        storageKey,
        mimeType: dto.mimeType,
        // The platform ceiling, not a per-request one: the client states a size
        // in the presign, and a client's claim decides nothing here.
        maxBytes,
      })
    },

    /**
     * Records a submitted registration.
     *
     * Every referenced upload is confirmed to exist in storage first, and its
     * real size is read from there. A browser can claim any key and any size;
     * a row pointing at bytes nobody uploaded would show the review team a
     * document that cannot be opened.
     */
    async submit(
      ctx: RegistrationServiceCtx,
      dto: SupplierRegistrationDto,
    ): Promise<RegistrationResult> {
      const organizationId = await intakeOrganizationId()

      const certificateScans = dto.certifications.filter((c) => c.storageKey)
      const totalUploads = dto.documents.length + certificateScans.length
      if (totalUploads > maxUploads) {
        throw new ValidationError(`A registration may carry at most ${maxUploads} files.`)
      }

      const documents: VerifiedUpload[] = []

      for (const doc of dto.documents) {
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

      // A certificate scan is filed as a CERTIFICATE document, not as a
      // SupplierCertification: the claim is recorded on the supplier, and only
      // a reviewer who has read the scan may turn it into a certification.
      for (const cert of certificateScans) {
        const stat = await storage.stat(cert.storageKey!)
        if (!stat) {
          throw new ValidationError(
            `The ${cert.type} certificate upload was not found. Please attach it again.`,
          )
        }
        documents.push({
          type: 'CERTIFICATE',
          storageKey: cert.storageKey!,
          title: cert.fileName ?? `${cert.type} certificate`,
          ...(cert.mimeType ? { mimeType: cert.mimeType } : {}),
          fileSize: stat.size,
          checksum: stat.checksum,
        })
      }

      const data: RegistrationData = {
        company: dto.company,
        contact: dto.contact,
        business: dto.business,
        productIds: dto.products.productIds,
        proposedProducts: dto.products.proposedProducts,
        claimedCertifications: dto.certifications.map((c) => c.type),
        documents,
        ...(dto.products.moq ? { moq: dto.products.moq } : {}),
        ...(dto.products.productionCapacity
          ? { productionCapacity: dto.products.productionCapacity }
          : {}),
        ...(dto.products.leadTimeDays === undefined
          ? {}
          : { leadTimeDays: dto.products.leadTimeDays }),
        ...(dto.notes ? { notes: dto.notes } : {}),
      }

      const supplier = await repo.register(
        { actorId: SYSTEM_ACTOR_ID, organizationId, requestId: ctx.requestId },
        data,
      )

      await events.emit(
        makeEvent({
          type: 'supplier.self_registered',
          organizationId,
          actorId: SYSTEM_ACTOR_ID,
          data: {
            supplierId: supplier.id,
            supplierCode: supplier.supplierCode,
            companyName: supplier.companyName,
            country: dto.company.country,
          },
        }),
      )

      return supplier
    },
  }
}

export type SupplierRegistrationService = ReturnType<typeof createSupplierRegistrationService>
