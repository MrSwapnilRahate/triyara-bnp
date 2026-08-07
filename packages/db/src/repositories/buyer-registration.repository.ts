import type { BuyerType, DocumentType, ImportExperience } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

/**
 * A buyer's attachment, with its size read from storage rather than claimed by
 * the client. Typed to `DocumentType` deliberately: the supplier side's
 * `VerifiedUpload` carries a `SupplierDocumentType`, and five of those values
 * have no equivalent in the Document module that stores this row. Sharing that
 * type would compile and then fail at the database.
 */
export interface BuyerUpload {
  type: DocumentType
  storageKey: string
  title?: string
  mimeType?: string
  fileSize: number
  checksum?: string
}

// Public buyer registration (TRY-BNP-BUYER-REG).
//
// The mirror of supplier-registration.repository, and for the same reason: the
// Account, BuyerProfile, BuyerContact, BuyerProduct and Document repositories
// each open their own transaction and take no external client, so composing
// them would leave a buyer half-registered when any one failed. One act, one
// transaction.
//
// `VerifiedUpload` is imported rather than redeclared — a file whose size came
// from storage is the same thing on both sides of the trade.

export interface BuyerCompany {
  companyName: string
  legalName?: string
  businessType?: BuyerType
  country: string
  city?: string
  website?: string
  importExperience?: ImportExperience
}

export interface BuyerContactData {
  name: string
  designation?: string
  email?: string
  phone?: string
  whatsapp?: string
}

export interface BuyerProductData {
  product: string
  targetVolume?: string
  targetPrice?: string
  frequency?: string
}

export interface BuyerLogistics {
  destinationCountries: string[]
  destinationPort?: string
  incoterms: string[]
  paymentTerms: string[]
  certificationsRequired: string[]
  languages: string[]
}

export interface BuyerRegistrationData {
  company: BuyerCompany
  contact: BuyerContactData
  logistics: BuyerLogistics
  products: BuyerProductData[]
  documents: BuyerUpload[]
  annualRequirement?: string
  packaging?: string
  notes?: string
}

export interface BuyerRegistrationResult {
  id: string
  legalName: string
  registrationStatus: string
  submittedAt: Date | null
}

export interface BuyerApprovalRecord {
  id: string
  registrationStatus: string
  isVerified: boolean
  verifiedAt: Date | null
  version: number
}

export const buyerRegistrationRepository = {
  /**
   * Records a public buyer enquiry.
   *
   * Lands in PENDING_REVIEW while `relationshipStatus` stays PROSPECT: the two
   * are different questions, and a company nobody has checked is not yet a
   * customer of any standing.
   */
  async register(ctx: MutationCtx, data: BuyerRegistrationData): Promise<BuyerRegistrationResult> {
    return prisma.$transaction(async (tx) => {
      const now = new Date()

      const account = await tx.account.create({
        data: {
          organizationId: ctx.organizationId,
          // A buyer who gives only a trading name has told us their legal name
          // as far as they are concerned; refusing the submission over the
          // distinction would lose the enquiry.
          legalName: data.company.legalName ?? data.company.companyName,
          displayName: data.company.companyName,
          country: data.company.country,
          relationshipStatus: 'PROSPECT',
          registrationStatus: 'PENDING_REVIEW',
          isSelfRegistered: true,
          submittedAt: now,
          source: 'PUBLIC_REGISTRATION',
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: { id: true, legalName: true, registrationStatus: true, submittedAt: true },
      })

      await tx.buyerApproval.create({
        data: {
          accountId: account.id,
          organizationId: ctx.organizationId,
          fromStatus: null,
          toStatus: 'PENDING_REVIEW',
          decision: 'SUBMITTED',
          reviewerId: ctx.actorId,
          comments: 'Submitted through the public buyer registration form.',
        },
      })

      const profile = await tx.buyerProfile.create({
        data: {
          accountId: account.id,
          organizationId: ctx.organizationId,
          ...(data.company.businessType ? { businessType: data.company.businessType } : {}),
          ...(data.company.importExperience
            ? { importExperience: data.company.importExperience }
            : {}),
          ...(data.company.website ? { website: data.company.website } : {}),
          ...(data.annualRequirement ? { annualRequirement: data.annualRequirement } : {}),
          ...(data.packaging ? { packaging: data.packaging } : {}),
          ...(data.notes ? { description: data.notes } : {}),
          destinationCountries: data.logistics.destinationCountries,
          ...(data.logistics.destinationPort
            ? { destinationPort: data.logistics.destinationPort }
            : {}),
          incoterms: data.logistics.incoterms,
          paymentTerms: data.logistics.paymentTerms,
          certificationsRequired: data.logistics.certificationsRequired,
          languages: data.logistics.languages,
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: { id: true },
      })

      await tx.buyerContact.create({
        data: {
          accountId: account.id,
          organizationId: ctx.organizationId,
          name: data.contact.name,
          ...(data.contact.designation ? { designation: data.contact.designation } : {}),
          ...(data.contact.email ? { email: data.contact.email } : {}),
          ...(data.contact.phone ? { phone: data.contact.phone } : {}),
          ...(data.contact.whatsapp ? { whatsapp: data.contact.whatsapp } : {}),
          isPrimary: true,
        },
      })

      if (data.products.length > 0) {
        await tx.buyerProduct.createMany({
          data: data.products.map((item) => ({
            buyerProfileId: profile.id,
            product: item.product,
            ...(item.targetVolume ? { targetVolume: item.targetVolume } : {}),
            ...(item.targetPrice ? { targetPrice: item.targetPrice } : {}),
            ...(item.frequency ? { frequency: item.frequency } : {}),
          })),
        })
      }

      // The Document module's own shape, including its version row. Written
      // here rather than through documentRepository.create because that opens
      // its own transaction, which would put these outside this one — and a
      // document surviving a failed registration is exactly what the single
      // transaction exists to prevent.
      for (const doc of data.documents) {
        await tx.document.create({
          data: {
            organizationId: ctx.organizationId,
            accountId: account.id,
            type: doc.type,
            title: doc.title ?? doc.storageKey.split('/').pop() ?? 'Attachment',
            status: 'RECEIVED',
            currentFileVersion: 1,
            currentStorageKey: doc.storageKey,
            currentMimeType: doc.mimeType ?? 'application/octet-stream',
            currentOriginalFilename: doc.title ?? 'attachment',
            currentFileSize: doc.fileSize,
            currentChecksum: doc.checksum ?? '',
            createdById: ctx.actorId,
            updatedById: ctx.actorId,
            versions: {
              create: {
                versionNumber: 1,
                storageKey: doc.storageKey,
                mimeType: doc.mimeType ?? 'application/octet-stream',
                originalFilename: doc.title ?? 'attachment',
                fileSize: doc.fileSize,
                checksum: doc.checksum ?? '',
                uploadedById: ctx.actorId,
              },
            },
          },
        })
      }

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Account',
        entityId: account.id,
        action: 'buyer.self_registered',
        after: {
          companyName: data.company.companyName,
          country: data.company.country,
          products: data.products.length,
          documents: data.documents.length,
        },
      })

      return account
    })
  },

  findById(organizationId: string, id: string) {
    return prisma.account.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        id: true,
        legalName: true,
        registrationStatus: true,
        isVerified: true,
        verifiedAt: true,
        isSelfRegistered: true,
        version: true,
      },
    })
  },

  /**
   * Records a review decision.
   *
   * The version is checked in the WHERE clause, never compared after a read, so
   * two reviewers deciding at once cannot both win. Reaching APPROVED sets
   * `isVerified` in the same statement — "convert into a verified buyer" is one
   * transition, not a second thing someone has to remember to do.
   */
  async transition(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    toStatus: string,
    decision: string,
    comments?: string,
  ): Promise<BuyerApprovalRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.account.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, registrationStatus: true },
      })
      if (!before) throw new NotFoundError('Account not found.')

      const updated = await tx.account.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          registrationStatus: toStatus as never,
          ...(toStatus === 'APPROVED' ? { isVerified: true, verifiedAt: new Date() } : {}),
          updatedById: ctx.actorId,
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.account.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          registrationStatus: true,
          isVerified: true,
          verifiedAt: true,
          version: true,
        },
      })

      await tx.buyerApproval.create({
        data: {
          accountId: id,
          organizationId: ctx.organizationId,
          fromStatus: before.registrationStatus,
          toStatus: toStatus as never,
          decision: decision as never,
          reviewerId: ctx.actorId,
          ...(comments ? { comments } : {}),
        },
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Account',
        entityId: id,
        action: `buyer.${decision.toLowerCase()}`,
        before: { registrationStatus: before.registrationStatus },
        after: { registrationStatus: after.registrationStatus, isVerified: after.isVerified },
      })

      return after
    })
  },

  /**
   * Contacts for an account, primary first.
   *
   * `register` writes these rows and nothing read them back, so a buyer could
   * be approved with no way to tell them. Ordering matches the supplier side:
   * primary, then explicit sort order, then oldest.
   */
  contacts(organizationId: string, accountId: string) {
    return prisma.buyerContact.findMany({
      where: { accountId, organizationId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, email: true, phone: true, isPrimary: true },
    })
  },

  approvalHistory(organizationId: string, accountId: string) {
    return prisma.buyerApproval.findMany({
      where: { accountId, organizationId },
      orderBy: { reviewedAt: 'asc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        decision: true,
        reviewerId: true,
        comments: true,
        reviewedAt: true,
      },
    })
  },
}

export type BuyerRegistrationRepository = typeof buyerRegistrationRepository
