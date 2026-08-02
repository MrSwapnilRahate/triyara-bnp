import { randomUUID } from 'node:crypto'

import type { CertificationType, Prisma, SupplierBusinessType } from '@prisma/client'
import { ConflictError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

// Public supplier registration (TRY-BNP-SUPPLIER-REG).
//
// One method, one transaction. The existing sub-resource repositories each open
// their OWN `prisma.$transaction` and take no external client, so composing
// them here would run six independent transactions: a failure partway through
// would leave a supplier with no contact, or documents belonging to nothing.
// A registration is a single act by a single person and either lands whole or
// not at all, so it gets one transaction rather than six.
//
// Every write below goes through this file. No Prisma escapes into the service.

export interface RegistrationCompany {
  companyName: string
  legalName: string
  businessType: SupplierBusinessType
  country: string
  state?: string
  city?: string
  gstNumber?: string
  iecNumber?: string
  website?: string
  establishedYear?: number
  employeeCount?: number
}

export interface RegistrationContact {
  name: string
  designation?: string
  email?: string
  mobile?: string
  whatsapp?: string
}

export interface RegistrationBusiness {
  exportCountries: string[]
  shippingPorts: string[]
  languages: string[]
  packaging?: string
  paymentTerms?: string
  containerCapacity?: string
}

/** A file whose size and checksum were read from storage, never from the client. */
export interface VerifiedUpload {
  type: string
  storageKey: string
  title?: string
  mimeType?: string
  fileSize: number
  checksum?: string
}

export interface RegistrationData {
  company: RegistrationCompany
  contact: RegistrationContact
  business: RegistrationBusiness
  productIds: string[]
  proposedProducts: string[]
  claimedCertifications: CertificationType[]
  documents: VerifiedUpload[]
  moq?: string
  productionCapacity?: string
  leadTimeDays?: number
  notes?: string
}

export interface RegistrationResult {
  id: string
  supplierCode: string
  companyName: string
  status: string
  submittedAt: Date | null
}

/**
 * A tenant-unique reference for a self-registered company.
 *
 * `supplierCode` is caller-supplied everywhere else, because staff choose it.
 * Nobody is on hand to choose one here, and the registrant must not be asked to
 * invent our internal reference, so it is generated. `REG-` marks the origin at
 * a glance in the review queue.
 */
function generateCode(): string {
  return `REG-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
}

export const supplierRegistrationRepository = {
  /**
   * Records a public registration.
   *
   * Lands in PENDING_REVIEW rather than DRAFT: the supplier has finished, and
   * the record is waiting on us, not on them. `isSelfRegistered` marks that
   * nothing in it has been checked by anyone.
   */
  async register(ctx: MutationCtx, data: RegistrationData): Promise<RegistrationResult> {
    const attempt = async (supplierCode: string): Promise<RegistrationResult> =>
      prisma.$transaction(async (tx) => {
        const now = new Date()

        const supplier = await tx.supplier.create({
          data: {
            organizationId: ctx.organizationId,
            supplierCode,
            companyName: data.company.companyName,
            legalName: data.company.legalName,
            businessType: data.company.businessType,
            country: data.company.country,
            ...(data.company.state ? { state: data.company.state } : {}),
            ...(data.company.city ? { city: data.company.city } : {}),
            ...(data.company.gstNumber ? { gstNumber: data.company.gstNumber } : {}),
            ...(data.company.iecNumber ? { iecNumber: data.company.iecNumber } : {}),
            ...(data.company.website ? { website: data.company.website } : {}),
            ...(data.company.establishedYear
              ? { establishedYear: data.company.establishedYear }
              : {}),
            ...(data.company.employeeCount ? { employeeCount: data.company.employeeCount } : {}),

            exportCountries: data.business.exportCountries,
            shippingPorts: data.business.shippingPorts,
            languages: data.business.languages,
            ...(data.business.packaging ? { packaging: data.business.packaging } : {}),
            ...(data.business.paymentTerms ? { paymentTerms: data.business.paymentTerms } : {}),
            ...(data.business.containerCapacity
              ? { containerCapacity: data.business.containerCapacity }
              : {}),

            proposedProducts: data.proposedProducts,
            claimedCertifications: data.claimedCertifications,
            ...(data.moq ? { moq: data.moq } : {}),
            ...(data.productionCapacity ? { productionCapacity: data.productionCapacity } : {}),
            ...(data.leadTimeDays === undefined ? {} : { leadTimeDays: data.leadTimeDays }),

            status: 'PENDING_REVIEW',
            isSelfRegistered: true,
            submittedAt: now,
            createdById: ctx.actorId,
          },
          select: {
            id: true,
            supplierCode: true,
            companyName: true,
            status: true,
            submittedAt: true,
          },
        })

        // The approval history starts at the submission, so the trail is
        // complete from the supplier's own first action rather than from the
        // moment a reviewer happens to open it.
        await tx.supplierApproval.create({
          data: {
            supplierId: supplier.id,
            organizationId: ctx.organizationId,
            fromStatus: null,
            toStatus: 'PENDING_REVIEW',
            decision: 'SUBMITTED',
            reviewerId: ctx.actorId,
            comments: 'Submitted through the public registration form.',
          },
        })

        await tx.supplierContact.create({
          data: {
            supplierId: supplier.id,
            organizationId: ctx.organizationId,
            name: data.contact.name,
            role: 'OTHER',
            ...(data.contact.designation ? { designation: data.contact.designation } : {}),
            ...(data.contact.email ? { email: data.contact.email } : {}),
            ...(data.contact.mobile ? { phone: data.contact.mobile } : {}),
            ...(data.contact.whatsapp ? { whatsapp: data.contact.whatsapp } : {}),
            isPrimary: true,
          },
        })

        if (data.documents.length > 0) {
          await tx.supplierDocument.createMany({
            data: data.documents.map((doc) => ({
              supplierId: supplier.id,
              organizationId: ctx.organizationId,
              type: doc.type as never,
              storageKey: doc.storageKey,
              ...(doc.title ? { title: doc.title } : {}),
              ...(doc.mimeType ? { mimeType: doc.mimeType } : {}),
              fileSize: doc.fileSize,
              ...(doc.checksum ? { checksum: doc.checksum } : {}),
            })),
          })
        }

        if (data.productIds.length > 0) {
          // Only products this organization actually has. An unknown id would
          // otherwise fail the Restrict foreign key and take the whole
          // registration down over one stale entry in the picker.
          const known = await tx.product.findMany({
            where: {
              id: { in: data.productIds },
              organizationId: ctx.organizationId,
              deletedAt: null,
            },
            select: { id: true },
          })
          if (known.length > 0) {
            await tx.supplierProductOffering.createMany({
              data: known.map((product) => ({
                supplierId: supplier.id,
                organizationId: ctx.organizationId,
                productId: product.id,
                // Nothing here is agreed until someone has spoken to them.
                status: 'PENDING_APPROVAL' as const,
                // The company-level MOQ is free text ("2 containers", "5 MT"),
                // while an offering's is a decimal quantity. They are not the
                // same measure, so it is not copied down here — a reviewer sets
                // per-product terms once they exist.
                ...(data.leadTimeDays === undefined ? {} : { leadTimeDays: data.leadTimeDays }),
              })),
              skipDuplicates: true,
            })
          }
        }

        if (data.notes) {
          await tx.supplierNote.create({
            data: {
              supplierId: supplier.id,
              organizationId: ctx.organizationId,
              authorId: ctx.actorId,
              body: data.notes,
            },
          })
        }

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Supplier',
          entityId: supplier.id,
          action: 'supplier.self_registered',
          after: {
            supplierCode: supplier.supplierCode,
            companyName: supplier.companyName,
            country: data.company.country,
            documents: data.documents.length,
            claimedCertifications: data.claimedCertifications,
          },
        })

        return supplier
      })

    try {
      return await attempt(generateCode())
    } catch (error) {
      // The generated code collided with an existing one. Astronomically
      // unlikely at 10 hex characters, but a public endpoint should not hand a
      // supplier a 500 for something one retry resolves.
      if (isUniqueViolation(error)) {
        try {
          return await attempt(generateCode())
        } catch (retryError) {
          if (isUniqueViolation(retryError)) {
            throw new ConflictError('Could not allocate a supplier reference. Please try again.')
          }
          throw retryError
        }
      }
      throw error
    }
  },
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
  )
}

export type SupplierRegistrationRepository = typeof supplierRegistrationRepository
